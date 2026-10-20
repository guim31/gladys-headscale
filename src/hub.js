// -----------------------------------------------------------------------------
// The Headscale hub: reads the API on a timer of the container, publishes the
// devices and their states when they change, and fires the scene events on
// transitions (machine online / offline, key about to expire).
//
// Gladys never polls these devices (should_poll: false): the scene events must
// fire even for a machine whose device was not added, the intervals offered
// (30 s to 5 min) are not all in the core's list, and a device created
// without should_poll is never polled by Gladys 5.2 (Gladys#3198).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  DAY_MS,
  FEATURE_KEYS,
  buildMachineDevice,
  buildServerDevice,
  countOnline,
  daysLeft,
  formatDate,
  machineIds,
  machineOf,
  machineValues,
  serverIds,
  serverValues,
} from './devices.js';
import { ERROR_KINDS, createClient } from './headscale/client.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, render } from './texts.js';

const logger = createLogger({ name: 'headscale-hub' });

export const WIDGET_KEY = 'machines';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  ONLINE: 'machine_online',
  OFFLINE: 'machine_offline',
  KEY_EXPIRING: 'key_expiring',
});

// Days before expiry announced by `key_expiring` (the options of its `days`
// field); 0 = the key just expired.
export const EXPIRY_THRESHOLDS = [30, 14, 7, 3, 1, 0];

// The widget and the report flag a key that expires within this many days.
export const EXPIRY_WARNING_DAYS = 7;

export const HUB_TIMINGS = {
  // Every state is sent again at least this often, so that Gladys never shows
  // "no recent value" for a value that does not change.
  heartbeatMs: 12 * 60 * 60_000,
};

const MAX_STATES_PER_REQUEST = 100;

/** Time left before a key expires, Infinity when it never does. */
const remaining = (machine, at) => (machine.expiry === null ? Infinity : machine.expiry - at);

/** The smallest threshold crossed between two readings, or null. */
export function crossedThreshold(before, after) {
  const crossed = EXPIRY_THRESHOLDS.filter(
    (days) => before > days * DAY_MS && after <= days * DAY_MS,
  );
  return crossed.length > 0 ? Math.min(...crossed) : null;
}

export class HeadscaleHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/headscale/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    /** Machines of the last successful reading (after the user filter), in API order. */
    this.machines = [];
    /** Every machine of the last reading, before the filter (for the report). */
    this.total = 0;
    this.read = false;
    this.readAt = 0;
    this.error = null;
    /** Last value published per feature external id. */
    this.published = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.heartbeatAt = 0;
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats every cycle is logged once at its own level, then at
  // debug until it clears. LOG_LEVEL=debug shows everything. The addresses of
  // the tailnet are never logged.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key) {
    this.warned.delete(key);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const signature = JSON.stringify([config.url, config.apiKey, config.insecure, config.users]);
    if (signature !== this.signature) {
      // Another server, key or set of users: start over, without scene events
      // for what the first reading finds. The machines read so far stay until
      // that reading: only those it no longer lists are shown offline, so a
      // new API key does not make every machine blink offline.
      this.signature = signature;
      this.client =
        config.url && config.apiKey
          ? createClient(
              { url: config.url, apiKey: config.apiKey, insecure: config.insecure },
              this.request,
            )
          : null;
      this.read = false;
      this.error = null;
      this.published.clear();
      this.transports.clear();
    } else if (
      previous &&
      (previous.language !== config.language || previous.publishIps !== config.publishIps)
    ) {
      // Last seen is a localized text; the IP feature comes or goes.
      this.published.clear();
    }
    this.discovered = null;
    try {
      // Fresh: a reading in flight may have published before the change.
      await this.poll({ fresh: true });
    } finally {
      // Even after an unexpected error: the timer keeps reading.
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.polling?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.poll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading ---------------------------------------------------------------

  /**
   * Read the API and apply what changed. Concurrent calls share the read;
   * `fresh` reads again after the one in flight (the configuration changed).
   */
  poll({ fresh = false } = {}) {
    if (this.polling && !fresh) {
      return this.polling;
    }
    const previous = this.polling ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => this.readApi())
      .finally(() => {
        if (this.polling === current) {
          this.polling = null;
        }
      });
    this.polling = current;
    return current;
  }

  /** Gladys asks for a refresh (onPoll): read now. */
  async pollDevice() {
    await this.poll();
  }

  async readApi() {
    const client = this.client;
    if (!client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    let result;
    try {
      result = await client.read();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      // Reconfigured during the reading: this one is stale.
      if (client === this.client && !this.stopped) {
        await this.applyFailure(err);
      }
      return;
    }
    if (client === this.client && !this.stopped) {
      await this.applySuccess(result.machines, client.api);
    }
  }

  /** The machines the configuration follows: every one, or those of some users. */
  selected(machines) {
    const { users } = this.config;
    if (users.length === 0) {
      return machines;
    }
    return machines.filter((machine) => users.includes(machine.user.toLowerCase()));
  }

  async applySuccess(all, api) {
    const machines = this.selected(all);
    const now = this.now();
    let widgetChanged = this.error !== null || !this.read;
    if (this.error) {
      logger.info('Headscale: connection restored');
    } else if (!this.read) {
      logger.info(
        `Headscale: connected (API /${api}), ${machines.length} machine(s) followed out of ${all.length}`,
      );
    }
    this.error = null;
    this.resolved('read');

    const before = new Map(this.machines.map((machine) => [machine.id, machine]));
    const events = [];
    for (const machine of machines) {
      const prev = before.get(machine.id);
      // "Last seen" changes only at a transition: while online, it stays the
      // time the machine came online.
      machine.shownSeen =
        machine.online && prev?.online ? (prev.shownSeen ?? machine.lastSeen) : machine.lastSeen;
      widgetChanged ||=
        !prev ||
        prev.online !== machine.online ||
        prev.name !== machine.name ||
        daysLeft(prev, this.readAt) !== daysLeft(machine, now);
      // No event at the first reading (what was the state before?), nor for a
      // machine that just appeared.
      if (!this.read || !prev) {
        continue;
      }
      if (prev.online !== machine.online) {
        events.push([machine.online ? TRIGGERS.ONLINE : TRIGGERS.OFFLINE, machine, {}]);
      }
      const days = crossedThreshold(remaining(prev, this.readAt), remaining(machine, now));
      // A logout sets the expiry to a past date (1970 for 0.26): that is a
      // machine leaving, already told by machine_offline, not a key to renew.
      const loggedOut = machine.expiry !== prev.expiry && machine.expiry <= now;
      if (days !== null && !loggedOut) {
        events.push([
          TRIGGERS.KEY_EXPIRING,
          machine,
          { days, expiry: formatDate(machine.expiry, this.config.language) },
        ]);
      }
    }
    const gone = this.machines.filter(
      (machine) => !machines.some((candidate) => candidate.id === machine.id),
    );
    widgetChanged ||= gone.length > 0;
    this.machines = machines;
    this.total = all.length;
    this.read = true;
    this.readAt = now;

    await this.forget(gone);
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransports(true);
    await this.publishConnectionStatus();
    for (const [key, machine, extra] of events) {
      await this.fire(key, machine, extra);
    }
    if (widgetChanged) {
      this.refreshWidget();
    }
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Headscale: ${err.message}`);
    } else {
      logger.debug(`Headscale: ${err.message} (again)`);
    }
    await this.publishDevices();
    await this.publishTransports(false);
    await this.publishConnectionStatus();
    if (wasError !== err.kind) {
      this.refreshWidget();
    }
  }

  refreshWidget() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Machines gone from the API (or no longer followed): shown offline in Gladys. */
  async forget(machines) {
    const states = [];
    for (const machine of machines) {
      logger.debug(`Machine ${machine.name} is no longer followed`);
      const ids = machineIds(this.gladys, machine.id);
      for (const externalId of [...this.published.keys()]) {
        if (externalId.startsWith(`${ids.device}:`)) {
          this.published.delete(externalId);
        }
      }
      this.transports.delete(ids.device);
      if (machine.online) {
        states.push({ device_feature_external_id: ids.feature(FEATURE_KEYS.ONLINE), state: 0 });
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async fire(key, machine, extra) {
    logger.debug(`Machine ${machine.name}: ${key}`);
    try {
      await this.gladys.publishSceneEvent(key, {
        device: machineIds(this.gladys, machine.id).device,
        machine: machine.name,
        user: machine.user,
        ...extra,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    if (!this.read) {
      return [];
    }
    const options = { language: this.config.language, publishIps: this.config.publishIps };
    return [
      buildServerDevice(this.gladys, options),
      ...this.machines.map((machine) => buildMachineDevice(this.gladys, machine, options)),
    ];
  }

  /** Publish the discovered devices when the list changes (names, machines, options). */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Discovered devices refused: ${err.message}`);
    }
  }

  values() {
    const options = {
      language: this.config.language,
      publishIps: this.config.publishIps,
      now: this.now(),
    };
    return [
      ...serverValues(this.gladys, this.machines),
      ...this.machines.flatMap((machine) => machineValues(this.gladys, machine, options)),
    ];
  }

  /** Publish what changed (`only`: one device, everything). */
  async publishStates({ force = false, only = null } = {}) {
    if (!this.read || this.error) {
      return;
    }
    const now = this.now();
    const heartbeat = !only && now - this.heartbeatAt >= this.timings.heartbeatMs;
    const states = [];
    for (const { externalId, value } of this.values()) {
      if (value === null || (only && !externalId.startsWith(`${only}:`))) {
        continue;
      }
      if (!force && !heartbeat && this.published.get(externalId) === value) {
        continue;
      }
      // A text/text feature takes `text`, every other one a numeric `state`.
      states.push(
        typeof value === 'string'
          ? { device_feature_external_id: externalId, text: value }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        for (const state of batch) {
          this.published.set(state.device_feature_external_id, state.state ?? state.text);
        }
        this.resolved('states');
      } catch (err) {
        // Refused values are not in `published`: they go again as changes.
        this.problem('states', `States refused: ${err.message}`);
      }
    }
    if (heartbeat) {
      // Even after a refusal: a heartbeat at every reading would flood Gladys.
      this.heartbeatAt = now;
    }
  }

  /** The transport badge of every device: local, or unreachable. */
  async publishTransports(reachable) {
    const transport = reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    const entries = [];
    if (this.read) {
      const ids = [
        serverIds(this.gladys).device,
        ...this.machines.map((machine) => machineIds(this.gladys, machine.id).device),
      ];
      for (const externalId of ids) {
        if (this.transports.get(externalId) !== transport) {
          entries.push({ external_id: externalId, transport });
        }
      }
    }
    // The SDK takes 100 entries per call.
    for (let at = 0; at < entries.length; at += 100) {
      const batch = entries.slice(at, at + 100);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.resolved('transports');
      } catch (err) {
        this.problem('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The problem of the configuration, as a message, or null. */
  configProblem() {
    const { config } = this;
    if (!config.url) {
      return config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl;
    }
    if (!config.apiKey) {
      return CONNECTION_TEXT.noApiKey;
    }
    return null;
  }

  /** The error of the last reading, as a message. */
  errorMessage() {
    return ERROR_TEXT[this.error.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP];
  }

  connectionStatus() {
    const problem = this.configProblem();
    if (problem) {
      return { connected: false, message: problem };
    }
    if (this.error) {
      return { connected: false, message: this.errorMessage() };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  isOurDevice(externalId) {
    return (
      machineOf(this.gladys, externalId) !== null || serverIds(this.gladys).device === externalId
    );
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.isOurDevice(device.external_id)) {
      return;
    }
    await this.publishStates({ force: true, only: device.external_id });
    // Sent before the device existed, the transport was dropped by Gladys.
    this.transports.delete(device.external_id);
    if (this.read || this.error) {
      await this.publishTransports(this.error === null);
    }
    this.refreshWidget();
  }

  /** "Search" in the Discovery tab: publish the devices again, read the API. */
  async rediscover() {
    this.discovered = null;
    await this.poll();
  }

  /** Machines whose key expires within EXPIRY_WARNING_DAYS days (expired ones included). */
  expiringSoon(now = this.now()) {
    return this.machines.filter((machine) => {
      const days = daysLeft(machine, now);
      return days !== null && days <= EXPIRY_WARNING_DAYS;
    });
  }

  // --- Configuration actions -------------------------------------------------

  /** "Test the connection": read now, then a short report. */
  async testConnection() {
    await this.poll({ fresh: true });
    const problem = this.configProblem();
    if (problem) {
      return problem;
    }
    if (this.error) {
      return this.errorMessage();
    }
    if (!this.read) {
      return Object.fromEntries(
        Object.entries(REPORT_TEXT).map(([language, text]) => [language, text.waiting]),
      );
    }
    const users = [...new Set(this.machines.map((machine) => machine.user))].filter(Boolean);
    return render(
      Object.fromEntries(
        Object.entries(REPORT_TEXT).map(([language, text]) => [
          language,
          this.total === 0 ? text.none : this.machines.length === 0 ? text.filtered : text.summary,
        ]),
      ),
      {
        machines: this.machines.length,
        total: this.total,
        online: countOnline(this.machines),
        expiring: this.expiringSoon().length,
        users: users.join(', ') || '-',
      },
    );
  }
}
