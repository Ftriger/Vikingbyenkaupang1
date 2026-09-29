const { isAuthed, dbConfig, getJSON, setJSON, mailConfigured, sendMails, readBody, send, esc } = require('./_lib');

const kr = n => Number(n || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
const dato = d => d ? new Date(d).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fyll = (tpl, m, extra = {}) => String(tpl || '')
  .replace(/\{fornavn\}/g, m.fornavn || '')
  .replace(/\{etternavn\}/g, m.etternavn || '')
  .replace(/\{navn\}/g, [m.fornavn, m.etternavn].filter(Boolean).join(' '))
  .replace(/\{aar\}/g, extra.aar || new Date().getFullYear());

function wrapHtml(settings, inner) {
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:auto;color:#2C1A0E;line-height:1.5">
  <div style="background:#2C1A0E;color:#F5EDD8;padding:16px 20px;font-size:20px;letter-spacing:1px">${esc(settings.orgName)}</div>
  <div style="padding:20px;background:#FBF6EA;border:1px solid #EDE0C4">${inner}
  <p style="white-space:pre-line;margin-top:24px">${esc(settings.signatur)}</p></div></div>`;
}

function fakturaMail(settings, m, inv, purring, byIdAll = {}) {
  const navn = [m.fornavn, m.etternavn].filter(Boolean).join(' ');
  const intro = fyll(purring ? settings.purreTekst : settings.fakturaTekst, m, inv);
  const tittel = purring ? `Påminnelse: faktura ${inv.nr}` : `Faktura ${inv.nr}`;
  const alle = [m, ...((inv.andre || []).map(id => byIdAll[id]).filter(Boolean))];
  const rader = [
    ['Fakturanr.', inv.nr],
    alle.length > 1
      ? ['Medlemmer', alle.map(x => [x.fornavn, x.etternavn].filter(Boolean).join(' ')).join(', ')]
      : ['Medlem', navn + (m.nr ? ` (medlemsnr. ${m.nr})` : '')],
    ['Gjelder', inv.tekst || `Medlemskontingent ${inv.aar}`],
    ...(inv.kategori ? [['Medlemskap', `${inv.kategori} – ${kr(inv.belop)}`]] : []),
    ['Beløp', kr(inv.belop)],
    ['Forfall', dato(inv.forfall)], ['Kontonummer', settings.kontonr || '—'],
    ['Merk betalingen', `Faktura ${inv.nr} – ${navn}`],
  ];
  if (settings.vipps) rader.push(['Vipps', `#${settings.vipps} – merk med faktura ${inv.nr}`]);
  const text = `Hei ${m.fornavn || navn}!\n\n${intro}\n\n` + rader.map(r => `${r[0]}: ${r[1]}`).join('\n') + `\n\n${settings.signatur}`;
  const html = wrapHtml(settings, `<p>Hei ${esc(m.fornavn || navn)}!</p><p style="white-space:pre-line">${esc(intro)}</p>
    <h2 style="font-size:18px;margin:20px 0 8px">${esc(tittel)}</h2>
    <table style="border-collapse:collapse;width:100%">${rader.map(r =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #EDE0C4;color:#6B5F55">${esc(r[0])}</td><td style="padding:6px 8px;border-bottom:1px solid #EDE0C4;font-weight:bold">${esc(r[1])}</td></tr>`).join('')}</table>`);
  return { to: m.epost, subject: `${settings.orgName}: ${tittel} – ${inv.tekst || 'medlemskontingent ' + inv.aar}`, text, html };
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'Ikke innlogget' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Metode ikke tillatt' });
  if (!dbConfig()) return send(res, 500, { error: 'Databasen er ikke koblet til.' });
  if (!mailConfigured()) return send(res, 500, { error: 'E-post er ikke satt opp (SMTP eller Resend) i Vercel.' });

  const body = await readBody(req);
  const [members, invoices, settingsRaw, log] = await Promise.all([
    getJSON('members', []), getJSON('invoices', []), getJSON('settings', {}), getJSON('log', []),
  ]);
  const settings = { orgName: 'Kaupangprosjektet', signatur: 'Med vennlig hilsen\nKaupangprosjektet', ...settingsRaw };
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  const now = new Date().toISOString();
  let msgs = [], utenEpost = [], targets = [];

  if (body.type === 'info') {
    if (!body.subject || !body.body) return send(res, 400, { error: 'Mangler emne eller tekst' });
    targets = (body.memberIds || []).map(id => byId[id]).filter(Boolean);
    const seen = new Set();
    for (const m of targets) {
      if (!m.epost) { utenEpost.push(m.id); continue; }
      const adr = m.epost.toLowerCase();
      if (seen.has(adr)) continue; // familie med felles e-post får én e-post
      seen.add(adr);
      const txt = fyll(body.body, m);
      msgs.push({ _navn: [m.fornavn, m.etternavn].filter(Boolean).join(' '),
        to: m.epost, subject: fyll(body.subject, m),
        text: txt + '\n\n' + settings.signatur,
        html: wrapHtml(settings, `<p style="white-space:pre-line">${esc(txt)}</p>`),
      });
    }
  } else if (body.type === 'invoice' || body.type === 'reminder') {
    const purring = body.type === 'reminder';
    const ids = new Set(body.invoiceIds || []);
    for (const inv of invoices) {
      if (!ids.has(inv.id)) continue;
      if (purring && inv.status === 'betalt') continue;
      const m = byId[inv.memberId];
      if (!m) continue;
      if (!inv.kategori) {
        const p = settings.priser || {};
        const c = (m.kategorier || []).filter(k => Number(p[k]) > 0).sort((a, b) => Number(p[b]) - Number(p[a]))[0];
        if (c && Number(p[c]) === Number(inv.belop)) inv.kategori = c;
      }
      targets.push(inv);
      if (!m.epost) { utenEpost.push(m.id); continue; }
      msgs.push({ ...fakturaMail(settings, m, inv, purring, byId), _inv: inv.id, _navn: [m.fornavn, m.etternavn].filter(Boolean).join(' ') });
    }
  } else {
    return send(res, 400, { error: 'Ukjent type' });
  }

  const results = msgs.length ? await sendMails(msgs.map(({ _inv, _navn, ...m }) => m)) : [];
  const okTo = new Set(results.filter(r => r.ok).map(r => r.to));

  if (body.type !== 'info') {
    const sentInv = new Set(msgs.filter(m => okTo.has(m.to)).map(m => m._inv));
    for (const inv of invoices) {
      if (!sentInv.has(inv.id)) continue;
      if (body.type === 'invoice') inv.sentAt = now;
      else inv.reminders = [...(inv.reminders || []), now];
    }
    await setJSON('invoices', invoices);
  }

  const sendt = results.filter(r => r.ok).length;
  const feil = results.filter(r => !r.ok);
  log.unshift({
    at: now, type: body.type, subject: body.subject || (body.type === 'invoice' ? 'Faktura' : 'Purring'),
    antall: sendt, feil: feil.length, utenEpost: utenEpost.length,
    label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
    navn: [...new Set(msgs.filter(m => okTo.has(m.to)).map(m => m._navn))].filter(Boolean).slice(0, 300),
  });
  await setJSON('log', log.slice(0, 200));

  send(res, 200, { sendt, feil, utenEpost });
};
