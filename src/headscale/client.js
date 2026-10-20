// -----------------------------------------------------------------------------
// Headscale REST client (`/api/v1`, an API key as Bearer token). Read only.
//
// One reading = one or two requests, whatever the number of machines:
//   - 0.23 and later: GET /api/v1/node -> { nodes: [...] };
//   - 0.22: GET /api/v1/machine -> { machines: [...] } (the node endpoint
//     answers 404, the client then remembers the old one);
//   - 0.26 and later carry the routes in the node (availableRoutes,
//     approvedRoutes); before, GET /api/v1/routes lists them with their node.
// Checked against the real headscale/headscale images 0.22.3, 0.23.0, 0.26.1
// and 0.29.5 in Docker (test/fixtures/headscale).
//
// What the API says, and how it is read:
//   - `online`: whether the node holds its connection to the server now;
//   - `lastSeen`: updated when the node connects and disconnects;
//   - `expiry`: null or 0001-01-01 when the key never expires; a logged out
//     node gets the time of the logout, or 1970-01-01T00:02:03Z (the sentinel
//     of the Tailscale client, seen with 0.26): a past date, the key expired;
//   - the exit node is two routes (0.0.0.0/0 and ::/0), counted as one.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  TLS: 'tls',
  AUTH: 'auth',
  NOT_HEADSCALE: 'not_headscale',
  HTTP: 'http',
});

const EXIT_ROUTES = ['0.0.0.0/0', '::/0'];

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export class HeadscaleError extends Error {
  constructor(kind, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'HeadscaleError';
    this.kind = kind;
    this.status = status;
  }
}

/** A date of the API, in ms; null when absent or the zero time of Go. */
export function parseTime(value) {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  const time = Date.parse(value);
  // 0001-01-01T00:00:00Z: Go's zero time, "not set".
  if (Number.isNaN(time) || new Date(time).getUTCFullYear() < 1000) {
    return null;
  }
  return time;
}

/** Number of routes, the exit node (two prefixes) counted once. */
export function countRoutes(prefixes) {
  const unique = new Set(prefixes);
  const exit = EXIT_ROUTES.filter((prefix) => unique.has(prefix)).length;
  return unique.size - exit + (exit > 0 ? 1 : 0);
}

const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/** The tags of a node: `tags` since 0.27, forced and valid tags before. */
function tagsOf(node) {
  if (Array.isArray(node.tags)) {
    return strings(node.tags);
  }
  return [...new Set([...strings(node.forcedTags), ...strings(node.validTags)])];
}

/**
 * A node of the API, reduced to what the integration uses.
 * @param {object} node
 * @param {Map<string, {advertised: string[], enabled: string[]}>} [routes] /routes, before 0.26
 */
export function toMachine(node, routes) {
  const id = String(node.id ?? '');
  let advertised;
  let enabled;
  if (Array.isArray(node.availableRoutes)) {
    advertised = strings(node.availableRoutes);
    const approved = new Set(strings(node.approvedRoutes));
    enabled = advertised.filter((prefix) => approved.has(prefix));
  } else {
    const own = routes?.get(id);
    advertised = own?.advertised ?? [];
    enabled = own?.enabled ?? [];
  }
  return {
    id,
    name: node.givenName || node.name || id,
    hostname: typeof node.name === 'string' ? node.name : '',
    user: node.user?.name ?? '',
    online: node.online === true,
    lastSeen: parseTime(node.lastSeen),
    expiry: parseTime(node.expiry),
    ips: strings(node.ipAddresses),
    tags: tagsOf(node),
    routesAdvertised: countRoutes(advertised),
    routesEnabled: countRoutes(enabled),
  };
}

/** The /routes list of 0.22 to 0.25, by node id. */
export function groupRoutes(list) {
  const routes = new Map();
  for (const route of Array.isArray(list) ? list : []) {
    // `deletedAt` set: a route of a node that re-registered.
    if (route?.deletedAt || typeof route?.prefix !== 'string' || !route.advertised) {
      continue;
    }
    const id = String((route.node ?? route.machine)?.id ?? '');
    if (!routes.has(id)) {
      routes.set(id, { advertised: [], enabled: [] });
    }
    const entry = routes.get(id);
    entry.advertised.push(route.prefix);
    if (route.enabled) {
      entry.enabled.push(route.prefix);
    }
  }
  return routes;
}

/**
 * @param {object} options
 * @param {string} options.url `http(s)://host:port`, see parseServerUrl
 * @param {string} options.apiKey
 * @param {boolean} [options.insecure] accept a self-signed certificate
 * @param {Function} [request] HTTP seam (src/headscale/http.js)
 */
export function createClient({ url, apiKey, insecure = false }, request = httpRequest) {
  // Unknown until the first answer: `node` (0.23+) or `machine` (0.22).
  let api = null;

  async function get(path) {
    let response;
    try {
      response = await request(`${url}/api/v1${path}`, {
        headers: { authorization: `Bearer ${apiKey}` },
        insecure,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new HeadscaleError(ERROR_KINDS.TLS, `certificate refused (${err.code})`, {
          cause: err,
        });
      }
      throw new HeadscaleError(
        ERROR_KINDS.UNREACHABLE,
        `unreachable (${err.code ?? err.message})`,
        {
          cause: err,
        },
      );
    }
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new HeadscaleError(ERROR_KINDS.AUTH, `API key refused (HTTP ${status})`, { status });
    }
    if (status === 404) {
      return { notFound: true };
    }
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }
    if (status < 200 || status >= 300) {
      throw new HeadscaleError(ERROR_KINDS.HTTP, `HTTP ${status}`, { status });
    }
    if (!body || typeof body !== 'object') {
      // A reverse proxy's login page, another service on this port...
      throw new HeadscaleError(ERROR_KINDS.NOT_HEADSCALE, 'the answer is not JSON', { status });
    }
    return { body };
  }

  async function readNodes() {
    for (const candidate of api ? [api] : ['node', 'machine']) {
      const { notFound, body } = await get(`/${candidate}`);
      if (notFound) {
        continue;
      }
      const list = body[`${candidate}s`];
      // A node list is omitted from the JSON when empty (proto3).
      if (list !== undefined && !Array.isArray(list)) {
        break;
      }
      api = candidate;
      return list ?? [];
    }
    api = null;
    throw new HeadscaleError(ERROR_KINDS.NOT_HEADSCALE, 'no Headscale API at this address');
  }

  return {
    get api() {
      return api;
    },

    /** @returns {Promise<{ machines: ReturnType<typeof toMachine>[] }>} */
    async read() {
      const nodes = (await readNodes()).filter(
        (node) => node && typeof node === 'object' && /^\d+$/.test(String(node.id ?? '')),
      );
      let routes = null;
      if (nodes.some((node) => !Array.isArray(node.availableRoutes))) {
        // Before 0.26: the routes live on their own endpoint (gone since).
        const { notFound, body } = await get('/routes');
        routes = groupRoutes(notFound ? [] : body.routes);
      }
      return { machines: nodes.map((node) => toMachine(node, routes)) };
    },
  };
}
