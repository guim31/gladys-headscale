// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds. Headscale is a
// local server and one reading is one or two requests: 30 s is cheap.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  insecure: false,
  users: '',
  publish_ips: false,
  poll_interval: '60',
  language: 'fr',
};

// listen_addr of the Headscale sample configuration.
export const DEFAULT_PORT = 8080;

/**
 * Parse the address of the Headscale server: a bare host or IP
 * (`192.0.2.10`, http on port 8080 then), `host:port`, or a URL
 * (`https://headscale.example.com`, port 443). The path is dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host:port`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // A bare http address means Headscale itself, on 8080; https:// without a
  // port is a reverse proxy, on 443.
  const explicitPort = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]*\]|[^/:?#]*):\d+/i.test(withScheme);
  if (!explicitPort && url.protocol === 'http:' && !/^http:\/\//i.test(text)) {
    url.port = String(DEFAULT_PORT);
  }
  return url.origin;
}

/** User names typed by the user, separated by commas, spaces or new lines. */
export function parseUsers(raw) {
  const words = typeof raw === 'string' ? raw.split(/[\s,;]+/).filter(Boolean) : [];
  return [...new Set(words.map((word) => word.toLowerCase()))];
}

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const url = parseServerUrl(typed);
  const interval = POLL_INTERVALS.includes(String(source.poll_interval ?? ''))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url,
    invalidUrl: typed !== '' && url === null,
    // A key pasted with a new line or spaces around it.
    apiKey: typeof source.api_key === 'string' ? source.api_key.trim() : '',
    insecure: isTrue(source.insecure),
    users: parseUsers(source.users),
    publishIps: isTrue(source.publish_ips),
    pollIntervalMs: Number(interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
