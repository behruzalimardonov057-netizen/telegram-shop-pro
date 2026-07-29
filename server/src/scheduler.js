"use strict";
/**
 * Rejalashtiruvchi — kunlik avtomatik hisobot.
 * Har kuni belgilangan soatda barcha adminlarga ZIP hisobot yuboradi:
 *   - orders_daily.csv (kunlik + jami statistika)
 *   - errors_24h.csv
 *   - audit_24h.csv
 *   - summary.txt (qisqacha xulosa)
 * Sozlash: settings.daily_report_enabled ("1"/"0"),
 *          settings.daily_report_hour  (0..23, mahalliy vaqt)
 */
const { config } = require("./config");
const { db, getSettings } = require("./db");
const { logger } = require("./logger");
const { listAudit, audit } = require("./audit");
const { buildZip } = require("./zip");

let _bot = null;
let _timer = null;
let _lastRunKey = null;

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(header, rows, mapper) {
  return header.join(",") + "\n" + rows.map((r) => mapper(r).map(csvEscape).join(",")).join("\n");
}
function fmt(n) { return Number(n || 0).toLocaleString("ru-RU"); }

function collectReport() {
  const now = Math.floor(Date.now() / 1000);
  const since24 = now - 86400;
  const since7  = now - 7 * 86400;

  const s = getSettings();

  const totals = db.prepare("SELECT COUNT(*) c, IFNULL(SUM(total),0) s FROM orders").get();
  const t24    = db.prepare("SELECT COUNT(*) c, IFNULL(SUM(total),0) s FROM orders WHERE created_at >= ?").get(since24);
  const t7     = db.prepare("SELECT COUNT(*) c, IFNULL(SUM(total),0) s FROM orders WHERE created_at >= ?").get(since7);

  const byStatus = db.prepare(
    `SELECT status, COUNT(*) c, IFNULL(SUM(total),0) s
     FROM orders WHERE created_at >= ? GROUP BY status ORDER BY c DESC`
  ).all(since24);

  const orders24 = db.prepare(
    `SELECT o.id, o.status, o.total, o.name, o.phone, o.city, o.created_at,
            u.username, u.first_name
       FROM orders o LEFT JOIN users u ON u.tg_id = o.user_id
      WHERE o.created_at >= ? ORDER BY o.id DESC LIMIT 2000`
  ).all(since24);

  const errors = db.prepare(
    `SELECT id, ts, source, message, meta FROM logs
      WHERE level = 'error' AND ts >= ? ORDER BY id DESC LIMIT 2000`
  ).all(since24);

  const auditRows = listAudit({ since: since24, limit: 5000 }).rows;

  const summary =
`Telegram Shop — Kunlik hisobot
Vaqt: ${new Date().toISOString()}
Do'kon: ${s.shop_name} (${s.currency})

BUYURTMALAR
  Jami:      ${fmt(totals.c)} ta / ${fmt(totals.s)} ${s.currency}
  Oxirgi 24s:${fmt(t24.c)} ta / ${fmt(t24.s)} ${s.currency}
  Oxirgi 7k: ${fmt(t7.c)} ta / ${fmt(t7.s)} ${s.currency}

STATUSLAR (24s)
${byStatus.map(r => `  - ${r.status}: ${r.c} ta / ${fmt(r.s)}`).join("\n") || "  (yo'q)"}

XATOLAR (24s): ${errors.length}
AUDIT YOZUVLARI (24s): ${auditRows.length}
`;

  const files = [
    { name: "summary.txt", data: summary },
    { name: "orders_24h.csv",
      data: toCsv(
        ["id","ts","status","total","name","phone","city","username","first_name"],
        orders24,
        (o) => [o.id, new Date(o.created_at*1000).toISOString(), o.status, o.total, o.name, o.phone, o.city, o.username, o.first_name]
      ) },
    { name: "orders_totals.csv",
      data: toCsv(["scope","orders","revenue"], [
        { k: "all",  c: totals.c, s: totals.s },
        { k: "24h",  c: t24.c,    s: t24.s },
        { k: "7d",   c: t7.c,     s: t7.s },
      ], (r) => [r.k, r.c, r.s]) },
    { name: "errors_24h.csv",
      data: toCsv(["id","ts","source","message","meta"], errors,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.source, r.message, r.meta]) },
    { name: "audit_24h.csv",
      data: toCsv(["id","ts","actor_type","actor_id","actor_name","action","target","ip","meta"], auditRows,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.actor_type, r.actor_id, r.actor_name, r.action, r.target, r.ip, r.meta]) },
  ];

  return { zip: buildZip(files), summary, counts: { orders24: t24.c, errors: errors.length, audit: auditRows.length } };
}

async function sendDailyReport({ manual = false, actor = null } = {}) {
  if (!_bot) throw new Error("Bot ishga tushmagan");
  const admins = config.adminIds || [];
  if (!admins.length) throw new Error("ADMIN_IDS bo'sh");

  const { zip, counts } = collectReport();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `daily_report_${stamp}.zip`;
  const caption =
    `📊 <b>Kunlik hisobot</b> (${stamp})\n` +
    `📦 Buyurtmalar (24s): <b>${counts.orders24}</b>\n` +
    `❌ Xatolar (24s): <b>${counts.errors}</b>\n` +
    `🧾 Audit (24s): <b>${counts.audit}</b>` +
    (manual ? "\n<i>Qo'lda yuborildi.</i>" : "");

  let ok = 0, fail = 0;
  for (const id of admins) {
    try {
      await _bot.sendDocument(id, zip, { caption, parse_mode: "HTML" },
        { filename, contentType: "application/zip" });
      ok++;
    } catch (e) {
      fail++;
      logger.warn("scheduler", `Adminga yuborilmadi ${id}: ${e.message}`);
    }
  }
  audit({
    actorType: manual ? (actor?.actorType || "bot") : "system",
    actorId: actor?.id, actorName: actor?.name,
    action: manual ? "report.daily.manual" : "report.daily.auto",
    meta: { ok, fail, ...counts, bytes: zip.length },
  });
  logger.info("scheduler", `Kunlik hisobot yuborildi: ${ok}/${admins.length}`, counts);
  return { ok, fail, bytes: zip.length, counts };
}

function currentKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}-${d.getHours()}`;
}

function tick() {
  try {
    const s = getSettings();
    if (String(s.daily_report_enabled || "0") !== "1") return;
    const targetHour = Math.max(0, Math.min(23, Number(s.daily_report_hour ?? 9)));
    const now = new Date();
    if (now.getHours() !== targetHour) return;
    const key = currentKey();
    if (_lastRunKey === key) return;
    _lastRunKey = key;
    sendDailyReport().catch((e) => logger.error("scheduler", `Avtoyuborish xatosi: ${e.message}`));
  } catch (e) {
    logger.warn("scheduler", `tick xatosi: ${e.message}`);
  }
}

function startScheduler(bot) {
  _bot = bot;
  if (_timer) clearInterval(_timer);
  // Har 5 daqiqada tekshiramiz — belgilangan soatning birinchi tekshiruvida yuboriladi.
  _timer = setInterval(tick, 5 * 60 * 1000);
  _timer.unref?.();
  logger.info("scheduler", "Kunlik hisobot rejalashtiruvchisi yoqildi");
}

module.exports = { startScheduler, sendDailyReport, collectReport };
