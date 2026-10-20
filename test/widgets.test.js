// -----------------------------------------------------------------------------
// The `machines` widget, checked with the SDK's validateWidgetContent: the
// core vocabulary and its budget (8 components, 2 texts at most).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { MAX_ROWS } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

async function content(w, { language = 'en' } = {}) {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  const tree = ack.data.content;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

test('two tiles and one row per machine: expiring keys first, then online, then offline', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.add(3, { name: 'nas', online: false });
  w.server.setOnline('nas', false, w.clock.now() - 2 * 24 * 3_600_000);
  await w.hub.poll();
  let [online, total, status] = (await content(w)).components;
  assert.equal(online.value, 2);
  assert.equal(total.value, 3);
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.color]),
    [
      ['laptop', 'Online', 'success'],
      ['phone', 'Online', 'success'],
      ['nas', '2 days ago', 'neutral'],
    ],
  );
  // Six days left: the phone goes first, in orange; expired, in red.
  w.clock.advance(24 * 3_600_000);
  await w.hub.poll();
  [, , status] = (await content(w, { language: 'fr' })).components;
  assert.deepEqual(status.items[0], {
    label: 'phone',
    icon: 'key',
    value: 'Clé : encore 6 j',
    color: 'warning',
  });
  w.clock.advance(7 * 24 * 3_600_000);
  await w.hub.poll();
  [, , status] = (await content(w)).components;
  assert.deepEqual([status.items[0].value, status.items[0].color], ['Key expired', 'danger']);
});

test('a big tailnet is cut with a counter row', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  for (let i = 3; i < 15; i += 1) {
    w.server.add(i);
  }
  await w.hub.poll();
  const status = (await content(w)).components[2];
  assert.equal(status.items.length, MAX_ROWS + 1);
  assert.equal(status.items.at(-1).value, 14 - MAX_ROWS);
});

test('messages: configuration problem, outage, empty server, in the dashboard language', async (t) => {
  const empty = await createWorld({ config: { language: 'en' } });
  t.after(() => empty.app.stop());
  assert.match((await content(empty, { language: 'de' })).components[0].text, /Headscale-Servers/);
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.server.online = false;
  await w.hub.poll();
  assert.match((await content(w, { language: 'fr' })).components[0].text, /ne répond pas/);
  w.server.online = true;
  w.server.nodes = [];
  await w.hub.poll();
  assert.match((await content(w, { language: 'es' })).components[0].text, /ninguna máquina/);
});
