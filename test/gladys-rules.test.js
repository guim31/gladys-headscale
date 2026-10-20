// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of Headscale 0.22.3, 0.23.0, 0.26.1 and 0.29.5 (test/fixtures):
// online and offline machines, logged out ones, routes, keys that expire or
// not, IP addresses published or not, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'Headscale 0.29: online machines, routes, an expiring key', devices: 3 },
  {
    label: 'Headscale 0.29, a machine offline',
    devices: 3,
    world: () => ({ serverOptions: { snapshot: 'offline' } }),
  },
  { label: 'Headscale 0.26', devices: 2, world: () => ({ serverOptions: { version: '0.26' } }) },
  {
    label: 'Headscale 0.26, logged out (expiry 1970)',
    devices: 2,
    world: () => ({ serverOptions: { version: '0.26', snapshot: 'offline' } }),
  },
  {
    label: 'Headscale 0.23, /routes',
    devices: 2,
    world: () => ({ serverOptions: { version: '0.23' } }),
  },
  {
    label: 'Headscale 0.23, logged out',
    devices: 2,
    world: () => ({ serverOptions: { version: '0.23', snapshot: 'offline' } }),
  },
  {
    label: 'Headscale 0.22, /machine',
    devices: 2,
    world: () => ({ serverOptions: { version: '0.22' } }),
  },
  {
    label: 'IP addresses published',
    devices: 3,
    world: () => ({ config: { ...CONFIG, publish_ips: true } }),
  },
  { label: 'French names', devices: 3, world: () => ({ config: { ...CONFIG, language: 'fr' } }) },
  {
    label: 'German names',
    devices: 3,
    world: () => ({ config: { ...CONFIG, language: 'de', publish_ips: true } }),
  },
  { label: 'Spanish names', devices: 3, world: () => ({ config: { ...CONFIG, language: 'es' } }) },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, app } = await createWorld(scenario.world?.() ?? {});
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, scenario.devices, 'the server and every machine');

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
            const allowed = table.units_by_category[feature.category];
            if (allowed) {
              assert.ok(allowed.flat().includes(feature.unit), `${at}: unit not for its category`);
            }
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds.
          const value = gladys.fake.lastState(feature.external_id);
          if (value === undefined) {
            assert.fail(`${at}: no state published`);
          }
          if (feature.category === 'text') {
            // A text/text state is never empty, or Gladys ignores it.
            assert.equal(typeof value, 'string', `${at}: ${value} is not a text`);
            assert.ok(value.trim().length > 0, `${at}: empty text`);
            continue;
          }
          assert.equal(typeof value, 'number', `${at}: ${value} is not a number`);
          assert.ok(value >= feature.min && value <= feature.max, `${at}: ${value} out of bounds`);
          if (feature.type === 'integer' || feature.type === 'binary') {
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
