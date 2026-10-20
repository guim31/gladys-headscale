// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys: states, scene events, the connection
// status, the configuration, the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY, crossedThreshold } from '../src/hub.js';
import {
  CONFIG,
  FIXTURES,
  createAll,
  createWorld,
  machineIdsOf,
  serverIdsOf,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const PHONE_EXPIRY = Date.parse('2026-10-27T12:00:00Z');

test('the first reading publishes devices, states and the connection, without scene event', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Headscale', 'laptop (Headscale)', 'phone (Headscale)'],
  );
  const server = serverIdsOf(w.gladys);
  assert.equal(w.fake.lastState(server.feature(FEATURE_KEYS.ONLINE_MACHINES)), 2);
  assert.equal(w.fake.lastState(server.feature(FEATURE_KEYS.MACHINES)), 2);
  const laptop = machineIdsOf(w.gladys, '1');
  assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ONLINE)), 1);
  // 0.0.0.0/0 + ::/0 (the exit node, once) and 198.51.100.0/24; only the subnet approved.
  assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ROUTES_ADVERTISED)), 2);
  assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ROUTES_ENABLED)), 1);
  assert.match(w.fake.lastState(laptop.feature(FEATURE_KEYS.LAST_SEEN)), /\d+\/\d+\/\d+/);
  assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.KEY_EXPIRY)), undefined);
  const phone = machineIdsOf(w.gladys, '2');
  assert.equal(w.fake.lastState(phone.feature(FEATURE_KEYS.KEY_EXPIRY)), 7);
  assert.equal(w.fake.lastState(phone.feature(FEATURE_KEYS.IPS)), undefined, 'IPs off by default');
  const features = (name) =>
    w.fake.discoveredDevices
      .find((device) => device.name === name)
      .features.map((feature) => feature.external_id.split(':').at(-1));
  assert.ok(!features('laptop (Headscale)').includes(FEATURE_KEYS.KEY_EXPIRY), 'never expires');
  assert.ok(features('phone (Headscale)').includes(FEATURE_KEYS.KEY_EXPIRY));
  assert.deepEqual(new Set(w.fake.transports.map((entry) => entry.transport)), new Set(['local']));
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a machine going offline and coming back fires its scene events', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.clock.advance(60_000);
  w.server.setOnline('phone', false, w.clock.now());
  await w.hub.poll();
  const [offline] = events(w, TRIGGERS.OFFLINE);
  assert.deepEqual(offline.data, {
    device: machineIdsOf(w.gladys, '2').device,
    machine: 'phone',
    user: 'bob',
  });
  assert.equal(w.fake.lastState(machineIdsOf(w.gladys, '2').feature(FEATURE_KEYS.ONLINE)), 0);
  assert.equal(w.fake.lastState(serverIdsOf(w.gladys).feature(FEATURE_KEYS.ONLINE_MACHINES)), 1);
  w.clock.advance(60_000);
  w.server.setOnline('phone', true);
  await w.hub.poll();
  assert.deepEqual(
    events(w, TRIGGERS.ONLINE).map((event) => event.data.machine),
    ['phone'],
  );
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('a new machine fires nothing; a deleted one is shown offline, without event', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.add(3, { name: 'nas', user: 'alice' });
  await w.hub.poll();
  assert.equal(w.fake.discoveredDevices.length, 4);
  w.server.remove('nas');
  await w.hub.poll();
  assert.equal(w.fake.lastState(machineIdsOf(w.gladys, '3').feature(FEATURE_KEYS.ONLINE)), 0);
  assert.equal(w.fake.discoveredDevices.length, 3);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('key_expiring fires once per threshold crossed, with the days left', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  // 7 days and 5 hours left: the 7-day threshold is crossed 5 hours later.
  for (let hour = 0; hour < 6; hour += 1) {
    w.clock.advance(3_600_000);
    await w.hub.poll();
  }
  const fired = events(w, TRIGGERS.KEY_EXPIRING);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].data.days, 7);
  assert.equal(fired[0].data.machine, 'phone');
  assert.equal(fired[0].data.user, 'bob');
  assert.match(fired[0].data.expiry, /10\/27\/26/);
  assert.equal(w.fake.lastState(machineIdsOf(w.gladys, '2').feature(FEATURE_KEYS.KEY_EXPIRY)), 6);
  // Expired: days 0.
  w.clock.time = PHONE_EXPIRY + 60_000;
  await w.hub.poll();
  assert.deepEqual(
    events(w, TRIGGERS.KEY_EXPIRING).map((event) => event.data.days),
    [7, 0],
    'only the smallest threshold when several are crossed at once',
  );
  assert.equal(w.fake.lastState(machineIdsOf(w.gladys, '2').feature(FEATURE_KEYS.KEY_EXPIRY)), 0);
});

test('a renewed key fires nothing; an expiry set on a key that never expired does', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.setExpiry('phone', w.clock.now() + 90 * DAY_MS);
  await w.hub.poll();
  w.server.setExpiry('laptop', w.clock.now() + 2 * DAY_MS + 60_000);
  await w.hub.poll();
  assert.deepEqual(
    events(w, TRIGGERS.KEY_EXPIRING).map((event) => [event.data.machine, event.data.days]),
    [['laptop', 3]],
  );
  // The new feature makes Gladys propose "Update" in the Discovery tab.
  const laptop = w.fake.discoveredDevices.find((device) => device.name === 'laptop (Headscale)');
  assert.ok(
    laptop.features.some((feature) => feature.external_id.endsWith(FEATURE_KEYS.KEY_EXPIRY)),
  );
});

test('crossedThreshold', () => {
  assert.equal(crossedThreshold(Infinity, 40 * DAY_MS), null);
  assert.equal(crossedThreshold(Infinity, 20 * DAY_MS), 30);
  assert.equal(crossedThreshold(8 * DAY_MS, 6 * DAY_MS), 7);
  assert.equal(crossedThreshold(8 * DAY_MS, 0.5 * DAY_MS), 1);
  assert.equal(crossedThreshold(60_000, -1), 0);
  assert.equal(crossedThreshold(-1, -2), null);
});

test('only changes are published; everything again when a device is added', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const before = w.fake.states.length;
  await w.hub.poll();
  assert.equal(w.fake.states.length, before, 'nothing changed');
  const device = w.fake.discoveredDevices.find((d) => d.name === 'phone (Headscale)');
  await w.fake.deviceCreated(device);
  const sent = w.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.equal(sent.length, device.features.length, 'every feature of the phone');
  assert.ok(sent.every((id) => id.startsWith(`${device.external_id}:`)));
  assert.ok(w.fake.transports.some((entry) => entry.device_external_id === device.external_id));
});

test('the heartbeat sends every value again after 12 hours', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.setExpiry('phone', null);
  await w.hub.poll();
  const before = w.fake.states.length;
  w.clock.advance(12 * 3_600_000);
  await w.hub.poll();
  // Server: 2 values; each machine: online, last seen, 2 route counters.
  assert.equal(w.fake.states.length - before, 2 + 4 + 4);
});

test('the IP addresses are published only when the configuration says so', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, publish_ips: true } });
  t.after(() => w.app.stop());
  assert.equal(
    w.fake.lastState(machineIdsOf(w.gladys, '1').feature(FEATURE_KEYS.IPS)),
    '100.64.0.1, fd7a:115c:a1e0::1',
  );
  await w.fake.configUpdated({ ...CONFIG, publish_ips: false });
  const device = w.fake.discoveredDevices.find((d) => d.name === 'laptop (Headscale)');
  assert.ok(!device.features.some((feature) => feature.external_id.endsWith(FEATURE_KEYS.IPS)));
});

test('the users filter keeps the machines of these users only', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, users: 'Bob' } });
  t.after(() => w.app.stop());
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Headscale', 'phone (Headscale)'],
  );
  assert.equal(w.fake.lastState(serverIdsOf(w.gladys).feature(FEATURE_KEYS.MACHINES)), 1);
  const ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /1 machine\(s\) followed, 1 online.*Users: bob/);
  await w.fake.configUpdated({ ...CONFIG, users: 'carol' });
  const none = await w.fake.action('test_connection', {});
  assert.match(none.data.message.en, /2 machine\(s\), but none belongs/);
});

test('an outage: one status, devices unreachable, no state; back to normal after', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.online = false;
  await w.hub.poll();
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.ok(w.fake.transports.some((entry) => entry.transport === 'unreachable'));
  w.server.online = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(w.fake.sceneEvents, [], 'no machine changed');
});

test('a refused API key, another service, an error status: said in the status', async (t) => {
  const bad = await createWorld({ config: { ...CONFIG, api_key: 'expired' } });
  t.after(() => bad.app.stop());
  assert.match(bad.fake.connectionStatus.message.fr, /Clé d'API refusée/);
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.body = '<html>login</html>';
  await w.hub.poll();
  assert.match(w.fake.connectionStatus.message.en, /No Headscale API/);
  w.server.body = null;
  w.server.status = 500;
  await w.hub.poll();
  assert.match(w.fake.connectionStatus.message.en, /Unexpected answer/);
});

test('configuration problems are said in the status, nothing is read', async (t) => {
  for (const [config, expected] of [
    [{}, /address of your Headscale server/],
    [{ url: 'ftp://x', api_key: 'x' }, /not understood/],
    [{ url: '192.0.2.10' }, /API key/],
  ]) {
    const w = await createWorld({ config: { ...config, language: 'en' } });
    t.after(() => w.app.stop());
    assert.equal(w.fake.connectionStatus.connected, false);
    assert.match(w.fake.connectionStatus.message.en, expected);
    assert.deepEqual(w.server.requests, []);
    assert.deepEqual(w.fake.discoveredDevices, []);
  }
});

test('"Test the connection" reports the machines', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, language: 'fr' } });
  t.after(() => w.app.stop());
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    'Connecté : 2 machine(s) suivie(s), 2 en ligne, 0 clé(s) expirant sous 7 jours. Utilisateurs : alice, bob.',
  );
  w.server.online = false;
  const failed = await w.fake.action('test_connection', {});
  assert.match(failed.data.message.en, /does not answer/);
});

test('a new server starts over without scene events; a new language republishes texts', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, url: '192.0.2.99' } });
  t.after(() => w.app.stop());
  assert.equal(w.fake.connectionStatus.connected, false);
  await w.fake.configUpdated(CONFIG);
  assert.equal(w.fake.discoveredDevices.length, 3);
  assert.deepEqual(w.fake.sceneEvents, []);
  const before = w.fake.states.length;
  await w.fake.configUpdated({ ...CONFIG, language: 'de' });
  const texts = w.fake.states.slice(before).filter((state) => state.text !== undefined);
  assert.ok(texts.length > 0, 'dates in German');
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('"last seen" stays the time the machine came online while it stays online', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const feature = machineIdsOf(w.gladys, '1').feature(FEATURE_KEYS.LAST_SEEN);
  const first = w.fake.lastState(feature);
  w.server.setOnline('laptop', true, w.clock.now() + 3_600_000);
  w.clock.advance(3_600_000);
  await w.hub.poll();
  assert.equal(w.fake.lastState(feature), first);
});

test('the container reads Headscale on its own timer, without Gladys polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  t.after(() => w.app.stop());
  const reads = () => w.server.requests.filter((r) => r.path === '/api/v1/node').length;
  assert.equal(reads(), 1);
  w.server.setOnline('phone', false);
  t.mock.timers.tick(60_000);
  // Let the reading's promises settle.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(reads(), 2);
  assert.deepEqual(
    events(w, TRIGGERS.OFFLINE).map((event) => event.data.machine),
    ['phone'],
  );
  assert.ok(w.fake.discoveredDevices.every((device) => device.should_poll === false));
});

for (const version of ['0.26', '0.23', '0.22']) {
  test(`Headscale ${version}: the machine, its routes and its logout`, async (t) => {
    const w = await createWorld({ serverOptions: { version } });
    t.after(() => w.app.stop());
    await createAll(w);
    const laptop = machineIdsOf(w.gladys, '1');
    assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ONLINE)), 1);
    // The exit node and a subnet, none approved in these captures.
    assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ROUTES_ADVERTISED)), 2);
    assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ROUTES_ENABLED)), 0);
    // The real answer after `docker stop` of the client: offline, key expired.
    w.server.nodes = structuredClone(
      FIXTURES[version].offline[version === '0.22' ? 'machines' : 'nodes'],
    );
    w.clock.advance(60_000);
    await w.hub.poll();
    assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.ONLINE)), 0);
    assert.equal(w.fake.lastState(laptop.feature(FEATURE_KEYS.KEY_EXPIRY)), 0);
    assert.deepEqual(w.fake.sceneEvents.map((event) => [event.key, event.data.days]).sort(), [
      [TRIGGERS.KEY_EXPIRING, 0],
      [TRIGGERS.OFFLINE, undefined],
    ]);
  });
}
