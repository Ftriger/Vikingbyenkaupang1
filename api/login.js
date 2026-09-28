const { checkPassword, sign, readBody, send } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'kp_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Metode ikke tillatt' });
  if (!process.env.ADMIN_PASSWORD) return send(res, 500, { error: 'ADMIN_PASSWORD er ikke satt i Vercel.' });
  const { password } = await readBody(req);
  if (!checkPassword(password)) {
    await new Promise(r => setTimeout(r, 800)); // bremser gjetting
    return send(res, 401, { error: 'Feil passord' });
  }
  const token = sign({ role: 'admin', exp: Date.now() + 12 * 3600 * 1000 });
  res.setHeader('Set-Cookie', `kp_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
  send(res, 200, { ok: true });
};
