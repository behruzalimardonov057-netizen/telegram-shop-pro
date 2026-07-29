"use strict";
/**
 * Markazlashgan log tizimi.
 * Barcha tranzaksiya / bot / webhook xatolari SQLite'ga yoziladi va
 * admin panel "Monitoring" sahifasida ko'rsatiladi.
 */
const { db } = require("./db");

db.exec(`
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  level TEXT NOT NULL,          -- debug | info | warn | error
  source TEXT NOT NULL,         -- bot | webhook | order | api | backup | auth | system
  message TEXT NOT NULL,
  meta TEXT,                    -- JSON
  ref_id TEXT                   -- order id / user id / job id
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
`);

const LEVELS = ["debug", "info", "warn", "error"];
const MAX_ROWS = Number(process.env.LOG_MAX_ROWS) || 20000;
const MAX_AGE_DAYS = Number(process.env.LOG_MAX_AGE_DAYS) || 30;

const insertStmt = db.prepare(
  "INSERT INTO logs (level, source, message, meta, ref_id) VALUES (?,?,?,?,?)"
);

function safeJson(v) {
  if (v === undefined || v === null) return null;
  try {
    const s = JSON.stringify(v);
    return s.length > 8000 ? s.slice(0, 8000) + "…" : s;
  } catch {
    return String(v).slice(0, 2000);
  }
}

/** `error` darajali loglar uchun obunachilar (bot ogohlantirishlari) */
const errorSubscribers = [];
function onError(fn) {
  if (typeof fn === "function") errorSubscribers.push(fn);
}

function write(level, source, message, meta, refId) {
  const lvl = LEVELS.includes(level) ? level : "info";
  const msg = String(message == null ? "" : message).slice(0, 2000);
  try {
    insertStmt.run(lvl, String(source || "system"), msg, safeJson(meta), refId == null ? null : String(refId));
  } catch (e) {
    console.error("logger write failed:", e.message);
  }
  const tag = { debug: "·", info: "ℹ️", warn: "⚠️", error: "❌" }[lvl];
  const line = `${tag} [${source}] ${msg}`;
  if (lvl === "error") {
    console.error(line);
    for (const fn of errorSubscribers) {
      try {
        fn({ level: lvl, source, message: msg, meta, refId });
      } catch {}
    }
  }
  else if (lvl === "warn") console.warn(line);
  else console.log(line);
}

const logger = {
  debug: (source, message, meta, refId) => write("debug", source, message, meta, refId),
  info: (source, message, meta, refId) => write("info", source, message, meta, refId),
  warn: (source, message, meta, refId) => write("warn", source, message, meta, refId),
  error: (source, message, meta, refId) => write("error", source, message, meta, refId),
};

/** Filtrlangan loglar ro'yxati */
function listLogs({ level, source, q: search, since, limit = 200, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (level && LEVELS.includes(level)) {
    where.push("level = ?");
    args.push(level);
  }
  if (source) {
    where.push("source = ?");
    args.push(source);
  }
  if (search) {
    where.push("(message LIKE ? OR IFNULL(meta,'') LIKE ? OR IFNULL(ref_id,'') LIKE ?)");
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  if (since) {
    where.push("ts >= ?");
    args.push(Number(since));
  }
  const sql = `SELECT * FROM logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...args, Math.min(Number(limit) || 200, 1000), Number(offset) || 0);
  const total = db
    .prepare(`SELECT COUNT(*) c FROM logs ${where.length ? "WHERE " + where.join(" AND ") : ""}`)
    .get(...args).c;
  return { rows, total };
}

/** Monitoring sahifasi uchun umumiy ko'rsatkichlar */
function logStats() {
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const byLevel = Object.fromEntries(
    db.prepare("SELECT level, COUNT(*) c FROM logs WHERE ts >= ? GROUP BY level").all(dayAgo).map((r) => [r.level, r.c])
  );
  const bySource = db
    .prepare("SELECT source, COUNT(*) c FROM logs WHERE ts >= ? GROUP BY source ORDER BY c DESC")
    .all(dayAgo);
  const byHour = db
    .prepare(
      `SELECT strftime('%Y-%m-%d %H:00', ts, 'unixepoch') h,
              SUM(CASE WHEN level='error' THEN 1 ELSE 0 END) errors,
              COUNT(*) total
       FROM logs WHERE ts >= ? GROUP BY h ORDER BY h`
    )
    .all(dayAgo);
  const lastErrors = db.prepare("SELECT * FROM logs WHERE level='error' ORDER BY id DESC LIMIT 10").all();
  return {
    total: db.prepare("SELECT COUNT(*) c FROM logs").get().c,
    last24h: { byLevel, bySource, byHour },
    lastErrors,
  };
}

function clearLogs(level) {
  if (level && LEVELS.includes(level)) return db.prepare("DELETE FROM logs WHERE level = ?").run(level).changes;
  return db.prepare("DELETE FROM logs").run().changes;
}

/** Eski loglarni tozalash */
function pruneLogs() {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_DAYS * 86400;
  const a = db.prepare("DELETE FROM logs WHERE ts < ?").run(cutoff).changes;
  const b = db.prepare(
    "DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)"
  ).run(MAX_ROWS).changes;
  return a + b;
}

module.exports = { logger, listLogs, logStats, clearLogs, pruneLogs, onError, LEVELS };
