// Sender neste bolk fra utsendingskøen. Kalles automatisk hvert 10. minutt
// (GitHub Actions) og fra medlemsregisteret når siden er åpen.
// Trenger ikke innlogging: den kan bare sende e-poster som styret allerede har lagt i kø,
// og aldri flere enn grensen tillater.
const { dbConfig, mailConfigured, send } = require('./_lib');
const { processQueue, status } = require('./_queue');

module.exports = async (req, res) => {
  try {
    if (!dbConfig() || !mailConfigured()) return send(res, 200, { iKo: 0 });
    const s = await status();
    if (!s.iKo || !s.igjenNaa) return send(res, 200, { iKo: s.iKo, nesteBolk: s.nesteBolk });
    const t0 = Date.now();
    let r, sendt = 0;
    do { r = await processQueue(); sendt += r.sendt.length; } while (r.sendt.length && r.iKo && Date.now() - t0 < 30000);
    send(res, 200, { sendt, iKo: r.iKo, nesteBolk: r.nesteBolk });
  } catch (e) {
    send(res, 200, { error: String(e.message || e) });
  }
};
