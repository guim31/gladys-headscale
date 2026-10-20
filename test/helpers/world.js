// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Headscale on a fake
// network and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless `timers: true` (with node:test mock
// timers): the tests read the API with `world.hub.poll()`.
// (Adapted from guim31/gladys-zerotier.)
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { machineIds, serverIds } from '../../src/devices.js';
import {
  API_KEY,
  FIXTURES,
  FIXTURE_CLOCK,
  FakeHeadscale,
  SERVER_URL,
  createNetwork,
} from './fakeHeadscale.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
// Dates are formatted in the time zone of Gladys.
process.env.TZ = 'Europe/Paris';

/** A manual clock. */
export function createClock(start = FIXTURE_CLOCK) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: '192.0.2.10', api_key: API_KEY, language: 'en' };

/**
 * @param {object} [options]
 * @param {object} [options.serverOptions] FakeHeadscale options
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  serverOptions = {},
  server = new FakeHeadscale(serverOptions),
  config = CONFIG,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: createNetwork(server),
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server, app, hub: app.hub, clock };
}

export const machineIdsOf = (gladys, id) => machineIds(gladys, id);
export const serverIdsOf = (gladys) => serverIds(gladys);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, FIXTURES, FakeHeadscale, SERVER_URL };
