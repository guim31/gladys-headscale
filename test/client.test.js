// -----------------------------------------------------------------------------
// The Headscale client and the configuration parsing, on real answers of
// Headscale 0.22.3, 0.23.0, 0.26.1 and 0.29.5 (test/fixtures/headscale).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl, parseUsers } from '../src/config.js';
import { ERROR_KINDS, countRoutes, createClient, parseTime } from '../src/headscale/client.js';
import { API_KEY, FakeHeadscale, SERVER_URL, createNetwork } from './helpers/fakeHeadscale.js';

function client(serverOptions = {}, options = {}) {
  const server = new FakeHeadscale(serverOptions);
  const request = createNetwork(server);
  return {
    server,
    client: createClient({ url: SERVER_URL, apiKey: API_KEY, ...options }, request),
  };
}

const kindOf = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err.kind;
  }
  return null;
};

test('0.29: one request, the routes in the node, the tags', async () => {
  const { client: api, server } = client();
  const { machines } = await api.read();
  assert.equal(api.api, 'node');
  assert.deepEqual(
    server.requests.map((r) => r.path),
    ['/api/v1/node'],
  );
  assert.deepEqual(machines[0], {
    id: '1',
    name: 'laptop',
    hostname: 'laptop',
    user: 'alice',
    online: true,
    lastSeen: Date.parse('2026-10-20T06:52:53.828335510Z'),
    expiry: null,
    ips: ['100.64.0.1', 'fd7a:115c:a1e0::1'],
    tags: [],
    routesAdvertised: 2,
    routesEnabled: 1,
  });
  assert.equal(machines[1].expiry, Date.parse('2026-10-27T12:00:00Z'));
  // The Bearer key goes in the header, never in the address.
  assert.equal(server.requests[0].options.headers.authorization, `Bearer ${API_KEY}`);
});

test('0.23: the nodes, then /routes; the zero time of Go is "never expires"', async () => {
  const { client: api, server } = client({ version: '0.23' });
  const { machines } = await api.read();
  assert.deepEqual(
    server.requests.map((r) => r.path),
    ['/api/v1/node', '/api/v1/routes'],
  );
  assert.equal(machines[0].expiry, null);
  assert.equal(machines[0].routesAdvertised, 2);
  assert.equal(machines[0].routesEnabled, 0);
});

test('0.22: /node answers 404, the client falls back to /machine and remembers it', async () => {
  const { client: api, server } = client({ version: '0.22' });
  const { machines } = await api.read();
  assert.equal(api.api, 'machine');
  assert.equal(machines[0].name, 'laptop');
  assert.equal(machines[0].online, true);
  server.requests.length = 0;
  await api.read();
  assert.deepEqual(
    server.requests.map((r) => r.path),
    ['/api/v1/machine', '/api/v1/routes'],
  );
});

test('0.26, logged out: the expiry of the Tailscale client (1970) is a past date', async () => {
  const { client: api } = client({ version: '0.26', snapshot: 'offline' });
  const [machine] = (await api.read()).machines;
  assert.equal(machine.online, false);
  assert.equal(machine.expiry, Date.parse('1970-01-01T00:02:03Z'));
});

test('errors: unreachable, refused key, not Headscale, HTTP status, certificate', async () => {
  const off = client();
  off.server.online = false;
  assert.equal(await kindOf(off.client.read()), ERROR_KINDS.UNREACHABLE);

  const server = new FakeHeadscale();
  const wrongKey = createClient({ url: SERVER_URL, apiKey: 'nope' }, createNetwork(server));
  assert.equal(await kindOf(wrongKey.read()), ERROR_KINDS.AUTH);

  const html = client();
  html.server.body = '<html></html>';
  assert.equal(await kindOf(html.client.read()), ERROR_KINDS.NOT_HEADSCALE);

  const other = client();
  other.server.nodes = null;
  other.server.handle = () => ({ status: 404, headers: {}, body: '404 page not found' });
  assert.equal(await kindOf(other.client.read()), ERROR_KINDS.NOT_HEADSCALE);

  const failing = client();
  failing.server.status = 502;
  assert.equal(await kindOf(failing.client.read()), ERROR_KINDS.HTTP);

  const tls = createClient({ url: 'https://192.0.2.10', apiKey: API_KEY }, async () => {
    const error = new Error('self-signed certificate');
    error.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
    throw error;
  });
  assert.equal(await kindOf(tls.read()), ERROR_KINDS.TLS);
});

test('the "accept a self-signed certificate" option reaches the request', async () => {
  const { client: api, server } = client({}, { insecure: true });
  await api.read();
  assert.equal(server.requests[0].options.insecure, true);
});

test('countRoutes counts the exit node once', () => {
  assert.equal(countRoutes([]), 0);
  assert.equal(countRoutes(['0.0.0.0/0', '::/0']), 1);
  assert.equal(countRoutes(['0.0.0.0/0', '::/0', '198.51.100.0/24', '198.51.100.0/24']), 2);
  assert.equal(countRoutes(['198.51.100.0/24', '2001:db8::/32']), 2);
});

test('parseTime', () => {
  assert.equal(parseTime(null), null);
  assert.equal(parseTime('0001-01-01T00:00:00Z'), null);
  assert.equal(parseTime('nonsense'), null);
  assert.equal(parseTime('1970-01-01T00:02:03Z'), 123_000);
});

test('parseServerUrl', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl(' 192.0.2.10:8081 '), 'http://192.0.2.10:8081');
  assert.equal(parseServerUrl('http://192.0.2.10'), 'http://192.0.2.10');
  assert.equal(parseServerUrl('https://headscale.example.com/'), 'https://headscale.example.com');
  assert.equal(
    parseServerUrl('https://headscale.example.com:8443/web'),
    'https://headscale.example.com:8443',
  );
  assert.equal(parseServerUrl('[2001:db8::1]'), 'http://[2001:db8::1]:8080');
  assert.equal(parseServerUrl('ftp://x'), null);
  assert.equal(parseServerUrl('https://user:pass@headscale.example.com'), null);
  assert.equal(parseServerUrl(''), null);
});

test('normalizeConfig', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    invalidUrl: false,
    apiKey: '',
    insecure: false,
    users: [],
    publishIps: false,
    pollIntervalMs: 60_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'nope://',
    api_key: ' key\n',
    insecure: 'true',
    users: 'Alice, bob;alice',
    publish_ips: true,
    poll_interval: '300',
    language: 'es',
  });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.apiKey, 'key');
  assert.equal(config.insecure, true);
  assert.deepEqual(config.users, ['alice', 'bob']);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
  assert.deepEqual(parseUsers(undefined), []);
});
