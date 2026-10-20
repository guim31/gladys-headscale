// -----------------------------------------------------------------------------
// An in-memory Headscale, built on real answers of the headscale/headscale
// images 0.22.3, 0.23.0, 0.26.1 and 0.29.5 in Docker (test/fixtures/headscale,
// keys anonymized). It answers through `request`, the seam of
// src/headscale/http.js; tests never touch the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/headscale/${name}`, import.meta.url), 'utf8'));

export const FIXTURES = {
  0.29: { online: load('v0.29-nodes-online.json'), offline: load('v0.29-nodes-offline.json') },
  0.26: { online: load('v0.26-nodes-online.json'), offline: load('v0.26-nodes-offline.json') },
  0.23: {
    online: load('v0.23-nodes-online.json'),
    offline: load('v0.23-nodes-offline.json'),
    routes: load('v0.23-routes.json'),
  },
  0.22: {
    online: load('v0.22-machines-online.json'),
    offline: load('v0.22-machines-offline.json'),
    routes: load('v0.22-routes.json'),
  },
  notFound: load('not-found.json'),
};

export const API_KEY = 'hs-api-key-123';
export const SERVER_URL = 'http://192.0.2.10:8080';
// The fixtures were captured on 2026-10-20 between 06:52 and 06:57 UTC.
export const FIXTURE_CLOCK = Date.parse('2026-10-20T06:58:00Z');

const json = (status, body) => ({ status, headers: {}, body: JSON.stringify(body) });

export class FakeHeadscale {
  /**
   * @param {object} [options]
   * @param {'0.29'|'0.26'|'0.23'|'0.22'} [options.version]
   * @param {'online'|'offline'} [options.snapshot]
   */
  constructor({ version = '0.29', snapshot = 'online' } = {}) {
    this.version = version;
    const fixture = FIXTURES[version];
    this.legacy = version === '0.22';
    this.nodes = structuredClone(fixture[snapshot][this.legacy ? 'machines' : 'nodes']);
    this.routes = fixture.routes ? structuredClone(fixture.routes.routes) : null;
    this.online = true;
    this.status = null; // force an HTTP status on every request
    this.body = null; // force a raw body on every request
    this.requests = [];
  }

  find(name) {
    return this.nodes.find((node) => node.givenName === name);
  }

  setOnline(name, online, at) {
    const node = this.find(name);
    node.online = online;
    if (at !== undefined) {
      node.lastSeen = new Date(at).toISOString();
    }
  }

  /** ms, or null: the key never expires (Go's zero time before 0.26). */
  setExpiry(name, time) {
    this.find(name).expiry =
      time === null
        ? this.version >= '0.26'
          ? null
          : '0001-01-01T00:00:00Z'
        : new Date(time).toISOString();
  }

  add(id, { name = `node${id}`, user = 'alice', online = true } = {}) {
    const node = structuredClone(this.nodes[0]);
    Object.assign(node, { id: String(id), name, givenName: name, online });
    node.user = { ...node.user, name: user };
    node.ipAddresses = [`100.64.0.${id}`];
    node.expiry = null;
    if (Array.isArray(node.availableRoutes)) {
      Object.assign(node, { availableRoutes: [], approvedRoutes: [], subnetRoutes: [] });
    }
    this.nodes.push(node);
    return node;
  }

  remove(name) {
    this.nodes = this.nodes.filter((node) => node.givenName !== name);
  }

  handle(url, { headers }) {
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    // Headscale answers 401 in plain text.
    if (headers.authorization !== `Bearer ${API_KEY}`) {
      return { status: 401, headers: {}, body: 'Unauthorized\n' };
    }
    if (this.status) {
      return json(this.status, {});
    }
    if (this.body !== null) {
      return { status: 200, headers: {}, body: this.body };
    }
    const path = url.pathname;
    if (path === '/api/v1/node' && !this.legacy) {
      return json(200, { nodes: this.nodes });
    }
    if (path === '/api/v1/machine' && this.legacy) {
      return json(200, { machines: this.nodes });
    }
    if (path === '/api/v1/routes' && this.routes) {
      return json(200, { routes: this.routes });
    }
    return json(404, FIXTURES.notFound);
  }
}

/** The `request` seam: routes to the fake, refuses any other origin. */
export function createNetwork(server) {
  return async function request(raw, options = {}) {
    const url = new URL(raw);
    if (url.origin !== SERVER_URL) {
      const error = new Error('getaddrinfo ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    }
    server.requests.push({ method: options.method ?? 'GET', path: url.pathname, options });
    return server.handle(url, { headers: options.headers ?? {} });
  };
}
