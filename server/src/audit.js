"use strict";
/**
 * Audit jurnal — barcha admin amallari uchun.
 * "kim, qachon, nima, qanday manba orqali" — saqlanadi va monitoringda ko'rinadi.
 */
const { db } = require("./db");
const { logger } = require("./logger");

db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  actor_type TEXT NOT NULL,      -- 'bot' | 'panel' | 'system'
  actor_id TEXT,                 -- tg_id yoki admin login
  actor_name TEXT,
  action TEXT NOT NULL,          -- masalan: restore.confirm, orders.list, backup.create
  target TEXT,                   -- fayl/buyurtma id/foydalanuvchi va h.k.
  ip TEXT,
  meta TEXT                      -- JSON
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
`);

const ins = db.prepare(
  `INSERT INTO audit_log (actor_type, actor_id, actor_name, action, target, ip, meta)
   VALUES (?,?,?,?,?,?,?)`
);

function safeJson(v) {
  if (v == null) return null;
  try { const s = JSON.stringify(v); return s.length > 4000 ? s.slice(0, 4000) + "…" : s; }
  catch { return String(v).slice(0, 1000); }
}

/**
 * audit({ actorType, actorId, actorName, action, target, ip, meta })
 */
function audit(entry) {
  const e = entry || {};
  try {
    ins.run(
      String(e.actorType || "system"),
      e.actorId == null ? null : String(e.actorId),
      e.actorName == null ? null : String(e.actorName).slice(0, 120),
      String(e.action || "unknown").slice(0, 120),
      e.target == null ? null : String(e.target).slice(0, 200),
      e.ip == null ? null : String(e.ip).slice(0, 64),
      safeJson(e.meta)
    );
  } catch (err) {
    logger.warn("audit", `Yozib bo'lmadi: ${err.message}`);
  }
  logger.info("audit", `${e.actorType || "?"}:${e.actorId || "?"} → ${e.action}`, { target: e.target, meta: e.meta });
}

function listAudit({ actor, action, since, limit = 100, offset = 0 } = {}) {
  const where = []; const args = [];
  if (actor)  { where.push("(actor_id = ? OR actor_name = ?)"); args.push(String(actor), String(actor)); }
  if (action) { where.push("action LIKE ?"); args.push(`%${action}%`); }
  if (since)  { where.push("ts >= ?"); args.push(Number(since)); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...args, Math.min(Number(limit) || 100, 500), Number(offset) || 0);
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_log ${w}`).get(...args).c;
  return { rows, total };
}

/** Botga qulay wrapper */
function botAudit(tgUser, action, target, meta) {
  audit({
    actorType: "bot",
    actorId: tgUser?.id,
    actorName: tgUser?.username || tgUser?.first_name,
    action, target, meta,
  });
}

/** Panelga qulay wrapper */
function panelAudit(req, action, target, meta) {
  const admin = req.admin || {};
  audit({
    actorType: "panel",
    actorId: admin.id,
    actorName: admin.login || admin.name,
    action, target,
    ip: (req.get && req.get("x-forwarded-for")) || req.ip,
    meta,
  });
}

module.exports = { audit, botAudit, panelAudit, listAudit };
