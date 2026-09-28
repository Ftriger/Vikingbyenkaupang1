const { isAuthed, dbConfig, getJSON, setJSON, mailConfigured, readBody, send } = require('./_lib');

const DEFAULT_SETTINGS = {
  orgName: 'Kaupangprosjektet',
  kontonr: '',
  vipps: '',
  orgnr: '',
  signatur: 'Med vennlig hilsen\nKaupangprosjektet\npost@kaupangprosjektet.no',
  fakturaTekst: 'Takk for at du er medlem i Kaupangprosjektet! Her er faktura for medlemskontingent {aar}.',
  purreTekst: 'Vi kan ikke se å ha mottatt betaling for medlemskontingent {aar}. Dersom du allerede har betalt, kan du se bort fra denne påminnelsen.',
  priser: {},
};

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'Ikke innlogget' });
  if (!dbConfig()) return send(res, 200, { setup: { db: false, mail: mailConfigured() } });

  if (req.method === 'GET') {
    const [members, invoices, settings, categories, log] = await Promise.all([
      getJSON('members', []), getJSON('invoices', []), getJSON('settings', {}),
      getJSON('categories', []), getJSON('log', []),
    ]);
    return send(res, 200, {
      setup: { db: true, mail: mailConfigured() },
      members, invoices, categories, log,
      settings: { ...DEFAULT_SETTINGS, ...settings },
    });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const keys = ['members', 'invoices', 'settings', 'categories'];
    for (const k of keys) if (body[k] !== undefined) await setJSON(k, body[k]);
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: 'Metode ikke tillatt' });
};
