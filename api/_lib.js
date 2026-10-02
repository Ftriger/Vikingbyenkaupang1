// Felles hjelpefunksjoner for medlemsregisteret.
// Filer som starter med _ blir ikke egne endepunkter på Vercel.
const crypto = require('crypto');

// ── Database (Upstash Redis via REST – kobles til i Vercel → Storage) ──
function dbConfig() {
  const clean = v => (v || '').trim().replace(/^["']|["']$/g, '').trim();
  let url = clean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const token = clean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  if (url && !/^https?:\/\//.test(url)) url = 'https://' + url.replace(/^rediss?:\/\/[^@]*@/, '').replace(/:\d+$/, '');
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(cmd) {
  const cfg = dbConfig();
  if (!cfg) throw new Error('DB_MISSING');
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 120)); }
  if (j.error) throw new Error(j.error);
  return j.result;
}

const PREFIX = 'kp:';
async function getJSON(key, fallback) {
  const v = await redis(['GET', PREFIX + key]);
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
async function setJSON(key, value) {
  await redis(['SET', PREFIX + key, JSON.stringify(value)]);
}

// ── Innlogging (passord i miljøvariabel ADMIN_PASSWORD, signert cookie) ──
function secret() {
  return process.env.SESSION_SECRET || ('kp-' + (process.env.ADMIN_PASSWORD || ''));
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!p.exp || p.exp < Date.now()) return null;
  return p;
}
function getCookie(req, name) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function isAuthed(req) {
  return !!(process.env.ADMIN_PASSWORD && verify(getCookie(req, 'kp_session')));
}
function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || typeof pw !== 'string') return false;
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── E-post: SMTP (egen e-postleverandør) eller Resend ──
function mailConfigured() {
  return !!(process.env.SMTP_HOST || process.env.RESEND_API_KEY);
}
function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_USER || 'post@kaupangprosjektet.no';
}

// msgs: [{to, subject, text, html}]
async function sendMails(msgs) {
  const results = [];
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    const tx = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true, maxConnections: 2,
    });
    for (const m of msgs) {
      try {
        await tx.sendMail({ from: fromAddress(), replyTo: process.env.MAIL_REPLY_TO || undefined, ...m });
        results.push({ to: m.to, ok: true });
      } catch (e) { results.push({ to: m.to, ok: false, error: e.message }); }
    }
    tx.close();
    return results;
  }
  if (process.env.RESEND_API_KEY) {
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(m => ({
          from: fromAddress(), to: [m.to], subject: m.subject, text: m.text, html: m.html,
          reply_to: process.env.MAIL_REPLY_TO || undefined,
        }))),
      });
      const ok = r.ok;
      const err = ok ? null : (await r.text()).slice(0, 300);
      chunk.forEach(m => results.push({ to: m.to, ok, error: err || undefined }));
    }
    return results;
  }
  throw new Error('MAIL_MISSING');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(resolve => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = {
  dbConfig, redis, getJSON, setJSON, sign, verify, isAuthed, checkPassword,
  mailConfigured, sendMails, readBody, send, esc,
};
