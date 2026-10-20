// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the API key, never an address of the tailnet.
// (Adapted from guim31/gladys-zerotier.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, CONFIG, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at `level`. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

test('a normal reading cycle writes nothing at info, machines coming and going included', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.ok(logs.texts().some((text) => text.includes('2 machine(s) followed out of 2')));
  logs.clear();
  for (let i = 0; i < 10; i += 1) {
    w.clock.advance(3_600_000);
    w.server.setOnline('phone', i % 2 === 0);
    await w.hub.poll();
  }
  w.server.add(3);
  await w.hub.poll();
  assert.ok(w.fake.sceneEvents.length > 0);
  assert.deepEqual(logs.texts(), []);
});

test('an outage is logged once when it starts and once when it ends', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60_000);
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  w.server.online = true;
  await w.hub.poll();
  assert.equal(logs.lines.length, 2);
  assert.match(logs.texts()[1], /connection restored/);
});

test('neither the API key nor an address of the tailnet is written, even in debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  for (const config of [
    { ...CONFIG, api_key: 'wrong-secret-key' },
    { ...CONFIG, publish_ips: true },
  ]) {
    const w = await createWorld({ config });
    t.after(() => w.app.stop());
    w.server.setOnline('phone', false);
    await w.hub.poll();
    await w.fake.action('test_connection', {});
  }
  const all = logs.texts().join('\n');
  assert.ok(logs.lines.length > 0);
  assert.ok(!all.includes('secret-key'), 'no API key in the logs');
  assert.ok(!all.includes(API_KEY));
  assert.ok(!all.includes('100.64.'), 'no address of the tailnet');
});
