// Utsendingskø: e-postserveren tillater bare et visst antall e-poster per tidsrom
// (standard 60 e-poster per 65 minutter). Det som ikke får plass, legges i kø og
// sendes automatisk i neste bolk (via /api/queue, som kalles jevnlig).
const crypto = require('crypto');
const { getJSON, setJSON, sendMails, redis } = require('./_lib');

const LIMIT = Number(process.env.MAIL_LIMIT || 60);                 // e-poster per bolk
const WINDOW = Number(process.env.MAIL_WINDOW_MIN || 65) * 60000;   // ventetid i ms
const PER_RUN = Number(process.env.MAIL_PER_RUN || 30);             // maks per kall (unngår tidsavbrudd)

// Enkel lås, så to utsendinger ikke går samtidig
async function withLock(fn) {
  const key = 'kp:mailLock', id = crypto.randomUUID();
  for (let i = 0; i < 20; i++) {
    const ok = await redis(['SET', key, id, 'NX', 'EX', '120']);
    if (ok) {
      try { return await fn(); }
      finally { if ((await redis(['GET', key])) === id) await redis(['DEL', key]); }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('Utsending pågår allerede – prøv igjen om litt');
}

function quota(sentTimes, now = Date.now()) {
  const recent = sentTimes.filter(t => now - t < WINDOW);
  const left = Math.max(0, LIMIT - recent.length);
  const nextAt = left > 0 ? now : Math.min(...recent) + WINDOW;
  return { recent, left, nextAt };
}

const RATE_ERR = /rate|limit|too many|quota|421|450|451|452|454|4\.7\.|throttl/i;

// Sender så mye som kvoten tillater. Oppdaterer fakturaer og logg underveis.
async function processQueue() {
  return withLock(async () => {
    let [queue, sentTimes] = await Promise.all([getJSON('mailQueue', []), getJSON('mailSent', [])]);
    const now = Date.now();
    let { recent, left } = quota(sentTimes, now);
    const batch = queue.slice(0, Math.min(left, PER_RUN));
    const done = [];
    if (batch.length) {
      const results = await sendMails(batch.map(j => ({ to: j.to, subject: j.subject, text: j.text, html: j.html })));
      const requeue = [];
      let stopped = false;
      batch.forEach((job, i) => {
        const r = results[i];
        if (r.ok) { recent.push(Date.now()); done.push({ job, ok: true }); }
        else if (stopped || RATE_ERR.test(r.error || '')) { stopped = true; requeue.push(job); }
        else { recent.push(Date.now()); done.push({ job, ok: false, error: r.error }); } // feilede forsøk teller også mot grensen
      });
      queue = [...requeue, ...queue.slice(batch.length)];
      await setJSON('mailSent', recent);
      await setJSON('mailQueue', queue);
      if (stopped) await setJSON('mailSent', [...recent, ...Array(LIMIT).fill(Date.now())].slice(-LIMIT)); // serveren sa stopp – vent en hel periode

      // Oppdater fakturaer og logg
      const [invoices, log] = await Promise.all([getJSON('invoices', []), getJSON('log', [])]);
      const ts = new Date().toISOString();
      const byInv = Object.fromEntries(invoices.map(i => [i.id, i]));
      for (const d of done) {
        const inv = d.job.invId && byInv[d.job.invId];
        if (inv) {
          delete inv.queuedAt;
          if (d.ok) {
            if (d.job.kind === 'invoice') inv.sentAt = ts;
            else if (d.job.kind === 'reminder') inv.reminders = [...(inv.reminders || []), ts];
          }
        }
        const l = log.find(x => x.id === d.job.logId);
        if (l) {
          if (d.ok) { l.antall = (l.antall || 0) + 1; if (d.job.navn && !(l.navn || []).includes(d.job.navn)) l.navn = [...(l.navn || []), d.job.navn].slice(0, 300); }
          else l.feil = (l.feil || 0) + 1;
        }
      }
      for (const l of log) if (l.id) l.iKo = queue.filter(j => j.logId === l.id).length;
      await Promise.all([setJSON('invoices', invoices), setJSON('log', log)]);
    }
    const q = quota(recent);
    return {
      sendt: done.filter(d => d.ok).map(d => d.job),
      feil: done.filter(d => !d.ok).map(d => ({ to: d.job.to, error: d.error })),
      iKo: queue.length,
      nesteBolk: queue.length ? new Date(q.left > 0 ? Date.now() : q.nextAt).toISOString() : null,
    };
  });
}

async function enqueue(jobs) {
  if (!jobs.length) return;
  await withLock(async () => {
    const queue = await getJSON('mailQueue', []);
    const at = new Date().toISOString();
    await setJSON('mailQueue', [...queue, ...jobs.map(j => ({ id: crypto.randomUUID(), queuedAt: at, ...j }))]);
  });
}

async function status() {
  const [queue, sentTimes] = await Promise.all([getJSON('mailQueue', []), getJSON('mailSent', [])]);
  const q = quota(sentTimes);
  return { iKo: queue.length, igjenNaa: q.left, grense: LIMIT, ventetidMin: WINDOW / 60000,
    nesteBolk: queue.length ? new Date(q.left > 0 ? Date.now() : q.nextAt).toISOString() : null };
}

module.exports = { processQueue, enqueue, status, LIMIT, WINDOW };
