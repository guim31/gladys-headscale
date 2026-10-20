// -----------------------------------------------------------------------------
// Gladys devices: one "Headscale" device for the server, one per machine.
//
// Identity: the server is `server:headscale` (one server per integration); a
// machine is its Headscale node id (`machine:<id>`), stable as long as the
// node is not deleted from Headscale.
//
// Machine features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - online: presence-sensor/binary;
//   - last seen: text/text (Gladys has no timestamp couple). The date changes
//     only when the machine comes online or goes offline;
//   - key expires in: duration/integer in days, 0 once expired. Only for a
//     machine whose key expires (Headscale can disable expiry per node);
//   - advertised routes, enabled routes: counter-sensor/integer;
//   - IP addresses: text/text, only when the configuration publishes them.
// Server features: online machines, machines (counter-sensor/integer).
//
// The devices are published with should_poll: false: the integration reads
// the API on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'headscale';
export const MACHINE_TYPE = 'machine';
export const NODE_PARAM = 'HEADSCALE_NODE_ID';
export const USER_PARAM = 'HEADSCALE_USER';

export const DAY_MS = 24 * 60 * 60_000;

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  LAST_SEEN: 'last_seen',
  KEY_EXPIRY: 'key_expiry_days',
  ROUTES_ADVERTISED: 'routes_advertised',
  ROUTES_ENABLED: 'routes_enabled',
  IPS: 'ip_addresses',
  ONLINE_MACHINES: 'online_machines',
  MACHINES: 'machines',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.LAST_SEEN]: 'Last seen',
    [FEATURE_KEYS.KEY_EXPIRY]: 'Key expires in',
    [FEATURE_KEYS.ROUTES_ADVERTISED]: 'Advertised routes',
    [FEATURE_KEYS.ROUTES_ENABLED]: 'Enabled routes',
    [FEATURE_KEYS.IPS]: 'IP addresses',
    [FEATURE_KEYS.ONLINE_MACHINES]: 'Online machines',
    [FEATURE_KEYS.MACHINES]: 'Machines',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.LAST_SEEN]: 'Vue pour la dernière fois',
    [FEATURE_KEYS.KEY_EXPIRY]: 'La clé expire dans',
    [FEATURE_KEYS.ROUTES_ADVERTISED]: 'Routes annoncées',
    [FEATURE_KEYS.ROUTES_ENABLED]: 'Routes activées',
    [FEATURE_KEYS.IPS]: 'Adresses IP',
    [FEATURE_KEYS.ONLINE_MACHINES]: 'Machines en ligne',
    [FEATURE_KEYS.MACHINES]: 'Machines',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.LAST_SEEN]: 'Zuletzt gesehen',
    [FEATURE_KEYS.KEY_EXPIRY]: 'Schlüssel läuft ab in',
    [FEATURE_KEYS.ROUTES_ADVERTISED]: 'Angekündigte Routen',
    [FEATURE_KEYS.ROUTES_ENABLED]: 'Aktivierte Routen',
    [FEATURE_KEYS.IPS]: 'IP-Adressen',
    [FEATURE_KEYS.ONLINE_MACHINES]: 'Geräte online',
    [FEATURE_KEYS.MACHINES]: 'Geräte',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.LAST_SEEN]: 'Vista por última vez',
    [FEATURE_KEYS.KEY_EXPIRY]: 'La clave caduca en',
    [FEATURE_KEYS.ROUTES_ADVERTISED]: 'Rutas anunciadas',
    [FEATURE_KEYS.ROUTES_ENABLED]: 'Rutas activadas',
    [FEATURE_KEYS.IPS]: 'Direcciones IP',
    [FEATURE_KEYS.ONLINE_MACHINES]: 'Máquinas en línea',
    [FEATURE_KEYS.MACHINES]: 'Máquinas',
  },
};

// Display bounds (the core never applies them on write).
const MAX_MACHINES = 100_000;
const MAX_ROUTES = 1_000;
// Headscale accepts any expiry date: ten years covers the realistic ones.
const MAX_DAYS = 3_650;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 1,
  ...extra,
});

const textFeature = () =>
  sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    max: 0,
  });

const counter = (max) =>
  sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, { max });

/** The local date and time, in the configured language (TZ of Gladys). */
export function formatDate(time, language) {
  if (time === null || time === undefined) {
    return null;
  }
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(time),
  );
}

/** Days left before the key expires, started days counted (0 only once expired); null: never expires. */
export function daysLeft(machine, now) {
  if (machine.expiry === null) {
    return null;
  }
  return Math.min(MAX_DAYS, Math.max(0, Math.ceil((machine.expiry - now) / DAY_MS)));
}

// Order = display order in Gladys. `when`: the feature exists only then.
const MACHINE_FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: () =>
      sensor(DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.BINARY),
    value: ({ machine }) => (machine.online ? 1 : 0),
  },
  {
    key: FEATURE_KEYS.LAST_SEEN,
    definition: textFeature,
    // `shownSeen`: frozen while online (src/hub.js).
    value: ({ machine, language }) => formatDate(machine.shownSeen ?? machine.lastSeen, language),
  },
  {
    key: FEATURE_KEYS.KEY_EXPIRY,
    when: ({ machine }) => machine.expiry !== null,
    definition: () =>
      sensor(DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.INTEGER, {
        unit: DEVICE_FEATURE_UNITS.DAYS,
        max: MAX_DAYS,
      }),
    value: ({ machine, now }) => daysLeft(machine, now),
  },
  {
    key: FEATURE_KEYS.ROUTES_ADVERTISED,
    definition: () => counter(MAX_ROUTES),
    value: ({ machine }) => machine.routesAdvertised,
  },
  {
    key: FEATURE_KEYS.ROUTES_ENABLED,
    definition: () => counter(MAX_ROUTES),
    value: ({ machine }) => machine.routesEnabled,
  },
  {
    key: FEATURE_KEYS.IPS,
    when: ({ publishIps }) => publishIps,
    definition: textFeature,
    // Never empty: a node always has an address of the tailnet.
    value: ({ machine }) => (machine.ips.length > 0 ? machine.ips.join(', ') : '-'),
  },
];

export const countOnline = (machines) => machines.filter((machine) => machine.online).length;

const SERVER_FEATURES = [
  { key: FEATURE_KEYS.ONLINE_MACHINES, value: ({ machines }) => countOnline(machines) },
  { key: FEATURE_KEYS.MACHINES, value: ({ machines }) => machines.length },
];

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);
export const machineIds = (gladys, nodeId) => gladys.externalIds(MACHINE_TYPE, nodeId);

/** The node id of a machine device external id, null for any other. */
export function machineOf(gladys, externalId) {
  const prefix = gladys.externalIds(MACHINE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^\d+$/.test(id) ? id : null;
}

export const machineName = (machine) => `${machine.name} (Headscale)`;

const machineFeatures = (machine, options) =>
  MACHINE_FEATURES.filter(({ when }) => !when || when({ machine, ...options }));

/** Discovery payload of the server device. */
export function buildServerDevice(gladys, { language = 'en' } = {}) {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Headscale',
    external_id: ids.device,
    should_poll: false,
    features: SERVER_FEATURES.map(({ key }) => ({
      ...counter(MAX_MACHINES),
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/** Discovery payload of a machine device. */
export function buildMachineDevice(gladys, machine, { language = 'en', publishIps = false } = {}) {
  const ids = machineIds(gladys, machine.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: machineName(machine),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: NODE_PARAM, value: machine.id },
      { name: USER_PARAM, value: machine.user || '-' },
    ],
    features: machineFeatures(machine, { publishIps }).map(({ key, definition }) => ({
      ...definition(),
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature of a machine (null: nothing to publish).
 * @returns {Array<{ externalId: string, value: number|string|null }>}
 */
export function machineValues(gladys, machine, { language = 'en', publishIps = false, now }) {
  const ids = machineIds(gladys, machine.id);
  return machineFeatures(machine, { publishIps }).map(({ key, value }) => ({
    externalId: ids.feature(key),
    value: value({ machine, language, now }),
  }));
}

/** The value of every feature of the server. */
export function serverValues(gladys, machines) {
  const ids = serverIds(gladys);
  return SERVER_FEATURES.map(({ key, value }) => ({
    externalId: ids.feature(key),
    value: value({ machines }),
  }));
}
