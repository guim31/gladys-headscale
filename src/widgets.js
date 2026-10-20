// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `machines`.
//
// The use case: "which machines of my tailnet are up right now, and is a key
// about to expire?" at a glance. Two tiles (online machines, machines) and
// one status list: the machines whose key expires within 7 days first
// (something to do), then the online ones, then the others with the time
// they were last seen. No setting, no button: Headscale is administered with
// its own tools.
//
// Budget (8 components, 2 texts at most): 2 values and 1 status list, or a
// single text when there is nothing to show. The values are sent as values,
// not bound to device features, so the widget works before the devices are
// added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { daysLeft } from './devices.js';
import { EXPIRY_WARNING_DAYS, WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

// Rows of the status list (one more says how many are not shown).
export const MAX_ROWS = 9;

export const TEXT = {
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  machines: { en: 'Machines', fr: 'Machines', de: 'Geräte', es: 'Máquinas' },
  expired: {
    en: 'Key expired',
    fr: 'Clé expirée',
    de: 'Schlüssel abgelaufen',
    es: 'Clave caducada',
  },
  expiresIn: {
    en: 'Key: {days} d left',
    fr: 'Clé : encore {days} j',
    de: 'Schlüssel: noch {days} T.',
    es: 'Clave: quedan {days} d',
  },
  never: { en: 'Never seen', fr: 'Jamais vue', de: 'Nie gesehen', es: 'Nunca vista' },
  more: {
    en: 'Other machines',
    fr: 'Autres machines',
    de: 'Weitere Geräte',
    es: 'Otras máquinas',
  },
  empty: {
    en: 'No machine registered on Headscale yet.',
    fr: 'Aucune machine enregistrée sur Headscale pour le moment.',
    de: 'Noch kein Gerät bei Headscale registriert.',
    es: 'Todavía no hay ninguna máquina registrada en Headscale.',
  },
  waiting: {
    en: 'Waiting for the first reading of Headscale…',
    fr: 'En attente de la première lecture de Headscale…',
    de: 'Warte auf die erste Abfrage von Headscale…',
    es: 'Esperando la primera lectura de Headscale…',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language, ttl = 60) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: fit(pick(text, language), 300) }],
  };
}

/** "5 min ago", "2 h ago", "3 days ago", in the language of the dashboard. */
export function ago(time, now, language) {
  const minutes = Math.max(1, Math.round((now - time) / 60_000));
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'always', style: 'short' });
  if (minutes < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return format.format(-hours, 'hour');
  }
  return format.format(-Math.round(hours / 24), 'day');
}

const expiring = (machine, now) => {
  const days = daysLeft(machine, now);
  return days !== null && days < EXPIRY_WARNING_DAYS;
};

/** Order: key expiring (soonest first), online (by name), offline (latest seen first). */
function rank(machine, now) {
  if (expiring(machine, now)) {
    return 0;
  }
  return machine.online ? 1 : 2;
}

export function sortMachines(machines, now) {
  return [...machines].sort(
    (a, b) =>
      rank(a, now) - rank(b, now) ||
      (rank(a, now) === 0 ? a.expiry - b.expiry : 0) ||
      (rank(a, now) === 2 ? (b.lastSeen ?? 0) - (a.lastSeen ?? 0) : 0) ||
      a.name.localeCompare(b.name),
  );
}

function row(machine, now, language) {
  const label = fit(machine.name, 40);
  if (expiring(machine, now)) {
    const days = daysLeft(machine, now);
    return {
      label,
      icon: 'key',
      value: fit(
        machine.expiry <= now
          ? pick(TEXT.expired, language)
          : pick(TEXT.expiresIn, language).replace('{days}', String(days)),
        40,
      ),
      color: machine.expiry <= now ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
    };
  }
  if (machine.online) {
    return {
      label,
      icon: 'wifi',
      value: pick(TEXT.online, language),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    label,
    icon: 'wifi-off',
    value: fit(
      machine.lastSeen === null ? pick(TEXT.never, language) : ago(machine.lastSeen, now, language),
      40,
    ),
    color: WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.config) {
    return message(TEXT.waiting, language);
  }
  const problem = hub.configProblem();
  if (problem) {
    return message(problem, language);
  }
  if (hub.error) {
    return message(hub.errorMessage(), language, 30);
  }
  if (!hub.read) {
    return message(TEXT.waiting, language);
  }
  const now = hub.now();
  const machines = sortMachines(hub.machines, now);
  if (machines.length === 0) {
    return message(TEXT.empty, language);
  }
  const online = machines.filter((machine) => machine.online).length;
  const shown = machines.length > MAX_ROWS + 1 ? machines.slice(0, MAX_ROWS) : machines;
  const items = shown.map((machine) => row(machine, now, language));
  if (shown.length < machines.length) {
    items.push({
      label: pick(TEXT.more, language),
      icon: 'more-horizontal',
      value: machines.length - shown.length,
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  return {
    ttl_seconds: 30,
    components: [
      {
        type: 'value',
        value: online,
        label: pick(TEXT.online, language),
        icon: 'monitor',
        color: online > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        value: machines.length,
        label: pick(TEXT.machines, language),
        icon: 'server',
      },
      { type: 'status', items },
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
