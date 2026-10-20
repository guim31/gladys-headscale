// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './headscale/client.js';

/** The text of `language`, English when missing. */
export const pick = (text, language) =>
  typeof text === 'string' ? text : (text?.[language] ?? text?.en ?? '');

/** Replace `{name}` placeholders in every language of a text. */
export function render(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([language, value]) => [
      language,
      value.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all)),
    ]),
  );
}

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Headscale server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Headscale dans la configuration.",
    de: 'Gib die Adresse deines Headscale-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Headscale en la configuración.',
  },
  invalidUrl: {
    en: 'Server address not understood, e.g. https://headscale.example.com',
    fr: 'Adresse du serveur incomprise, ex. https://headscale.example.com',
    de: 'Serveradresse nicht verstanden, z. B. https://headscale.example.com',
    es: 'Dirección del servidor no válida, p. ej. https://headscale.example.com',
  },
  noApiKey: {
    en: 'Enter a Headscale API key in the configuration (headscale apikeys create).',
    fr: "Saisissez une clé d'API Headscale dans la configuration (headscale apikeys create).",
    de: 'Gib einen Headscale-API-Schlüssel in der Konfiguration ein (headscale apikeys create).',
    es: 'Introduzca una clave de API de Headscale en la configuración (headscale apikeys create).',
  },
};

// One short explanation per error kind (src/headscale/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Headscale does not answer: check the address and the port.',
    fr: "Headscale ne répond pas : vérifiez l'adresse et le port.",
    de: 'Headscale antwortet nicht: Prüfe Adresse und Port.',
    es: 'Headscale no responde: compruebe la dirección y el puerto.',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: turn on "Accept a self-signed certificate" if it is yours.',
    fr: "Certificat refusé : activez « Accepter un certificat auto-signé » s'il est le vôtre.",
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsigniertes Zertifikat akzeptieren“, wenn es deines ist.',
    es: 'Certificado rechazado: active «Aceptar un certificado autofirmado» si es el suyo.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused (expired or revoked?): create a new one.',
    fr: "Clé d'API refusée (expirée ou révoquée ?) : créez-en une nouvelle.",
    de: 'API-Schlüssel abgelehnt (abgelaufen oder widerrufen?): Erstelle einen neuen.',
    es: 'Clave de API rechazada (¿caducada o revocada?): cree una nueva.',
  },
  [ERROR_KINDS.NOT_HEADSCALE]: {
    en: 'No Headscale API at this address (0.22 or later).',
    fr: "Pas d'API Headscale à cette adresse (0.22 ou plus récent).",
    de: 'Keine Headscale-API unter dieser Adresse (0.22 oder neuer).',
    es: 'No hay ninguna API de Headscale en esta dirección (0.22 o posterior).',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Headscale.',
    fr: 'Réponse inattendue de Headscale.',
    de: 'Unerwartete Antwort von Headscale.',
    es: 'Respuesta inesperada de Headscale.',
  },
};

// "Test the connection".
export const REPORT_TEXT = {
  en: {
    summary:
      'Connected: {machines} machine(s) followed, {online} online, {expiring} key(s) expiring within 7 days. Users: {users}.',
    filtered: 'Connected: {total} machine(s), but none belongs to the users of the configuration.',
    none: 'Connected, but no machine is registered on this server yet.',
    waiting: 'Waiting for the first reading…',
  },
  fr: {
    summary:
      'Connecté : {machines} machine(s) suivie(s), {online} en ligne, {expiring} clé(s) expirant sous 7 jours. Utilisateurs : {users}.',
    filtered:
      "Connecté : {total} machine(s), mais aucune n'appartient aux utilisateurs de la configuration.",
    none: 'Connecté, mais aucune machine n’est encore enregistrée sur ce serveur.',
    waiting: 'En attente de la première lecture…',
  },
  de: {
    summary:
      'Verbunden: {machines} Gerät(e) verfolgt, {online} online, {expiring} Schlüssel laufen innerhalb von 7 Tagen ab. Benutzer: {users}.',
    filtered: 'Verbunden: {total} Gerät(e), aber keines gehört zu den Benutzern der Konfiguration.',
    none: 'Verbunden, aber auf diesem Server ist noch kein Gerät registriert.',
    waiting: 'Warte auf die erste Abfrage…',
  },
  es: {
    summary:
      'Conectado: {machines} máquina(s) seguida(s), {online} en línea, {expiring} clave(s) que caducan en 7 días. Usuarios: {users}.',
    filtered:
      'Conectado: {total} máquina(s), pero ninguna pertenece a los usuarios de la configuración.',
    none: 'Conectado, pero todavía no hay ninguna máquina registrada en este servidor.',
    waiting: 'Esperando la primera lectura…',
  },
};
