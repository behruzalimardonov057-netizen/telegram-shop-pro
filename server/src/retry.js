"use strict";
/**
 * Avtomatik qayta urinish (retry) mexanizmi.
 *
 * 1) retryAsync()   — inline eksponensial backoff bilan qayta urinish.
 * 2) Doimiy navbat  — muvaffaqiyatsiz webhook / buyurtma bildirishnomalari
 *    SQLite'dagi `retry_queue` jadvaliga yoziladi va fon ishchisi (worker)
 *    ularni backoff bilan qayta yuboradi. Server qayta ishga tushsa ham
 *    navbat yo'qolmaydi.
 */
const { db } = require("./db");
const { logger } = require("./logger");

db.exec(`
CREATE TABLE IF NOT EXISTS retry_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- tg_send | order_notify | webhook_update | custom
  payload TEXT NOT NULL,            -- JSON
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed | dead
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_error TEXT,
  ref_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_retry_due ON retry_queue(status, next_at);
`);

const BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS) || 2000;
const MAX_DELAY_MS = Number(process.env.RETRY_MAX_DELAY_MS) || 15 * 60 * 1000;
const DEFAULT_ATTEMPTS = Number(process.env.RETRY_MAX_ATTEMPTS) || 6;
const TICK_MS = Number(process.env.RETRY_TICK_MS) || 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Eksponensial backoff + jitter (ms) */
function backoffMs(attempt) {
  const raw = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(raw, MAX_DELAY_MS);
  return Math.round(capped * (0.75 + Math.random() * 0.5));
}

/**
 * Inline retry: funksiyani xatoda bir necha marta qayta chaqiradi.
 * `shouldRetry` false qaytarsa — darhol to'xtaydi.
 */
async function retryAsync(fn, { attempts = 3, source = "system", label = "task", shouldRetry = () => true } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      if (i >= attempts || !shouldRetry(e)) break;
      const wait = backoffMs(i);
      logger.warn(source, `${label}: urinish ${i}/${attempts} muvaffaqiyatsiz, ${Math.round(wait / 1000)}s dan keyin qayta`, {
        error: e?.message,
      });
      await sleep(wait);
    }
  }
  throw lastErr;
}

const handlers = new Map();
/** Navbat turi uchun ishlovchi ro'yxatdan o'tkazish */
function registerHandler(kind, fn) {
  handlers.set(kind, fn);
}

const insertJob = db.prepare(
  `INSERT INTO retry_queue (kind, payload, max_attempts, next_at, ref_id, attempts, last_error)
   VALUES (?,?,?,?,?,?,?)`
);

/** Navbatga vazifa qo'shish */
function enqueue(kind, payload, { maxAttempts = DEFAULT_ATTEMPTS, delayMs = 0, refId = null, attempts = 0, lastError = null } = {}) {
  const nextAt = Math.floor((Date.now() + delayMs) / 1000);
  const info = insertJob.run(kind, JSON.stringify(payload ?? {}), maxAttempts, nextAt, refId, attempts, lastError);
  const jobId = Number(info.lastInsertRowid);
  logger.info("retry", `Navbatga qo'shildi: ${kind} #${jobId}`, { payload: shallow(payload) }, refId);
  return jobId;
}

function shallow(p) {
  if (!p || typeof p !== "object") return p;
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v;
  return out;
}

const dueStmt = db.prepare(
  "SELECT * FROM retry_queue WHERE status='pending' AND next_at <= strftime('%s','now') ORDER BY id LIMIT ?"
);
const markDone = db.prepare(
  "UPDATE retry_queue SET status='done', attempts=?, last_error=NULL, updated_at=strftime('%s','now') WHERE id=?"
);
const markRetry = db.prepare(
  "UPDATE retry_queue SET attempts=?, next_at=?, last_error=?, updated_at=strftime('%s','now') WHERE id=?"
);
const markDead = db.prepare(
  "UPDATE retry_queue SET status='dead', attempts=?, last_error=?, updated_at=strftime('%s','now') WHERE id=?"
);

let running = false;
let timer = null;

async function processDue(limit = 20) {
  if (running) return { processed: 0 };
  running = true;
  let processed = 0;
  try {
    const jobs = dueStmt.all(limit);
    for (const job of jobs) {
      const handler = handlers.get(job.kind);
      const attempt = job.attempts + 1;
      if (!handler) {
        markDead.run(attempt, `Handler topilmadi: ${job.kind}`, job.id);
        logger.error("retry", `Handler yo'q: ${job.kind} (#${job.id})`, null, job.ref_id);
        continue;
      }
      let payload = {};
      try {
        payload = JSON.parse(job.payload);
      } catch {}
      try {
        await handler(payload, job);
        markDone.run(attempt, job.id);
        processed++;
        logger.info("retry", `Bajarildi: ${job.kind} #${job.id} (${attempt}-urinish)`, null, job.ref_id);
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 500);
        if (attempt >= job.max_attempts) {
          markDead.run(attempt, msg, job.id);
          logger.error("retry", `Yakuniy muvaffaqiyatsizlik: ${job.kind} #${job.id}`, { error: msg, attempts: attempt }, job.ref_id);
        } else {
          const nextAt = Math.floor((Date.now() + backoffMs(attempt)) / 1000);
          markRetry.run(attempt, nextAt, msg, job.id);
          logger.warn("retry", `${job.kind} #${job.id} xato (${attempt}/${job.max_attempts}) — qayta urinamiz`, { error: msg }, job.ref_id);
        }
      }
    }
  } finally {
    running = false;
  }
  return { processed };
}

function startRetryWorker() {
  if (timer) return timer;
  // Server qulab qolganda "running" holatida qolgan ishlar yo'q — barchasi pending.
  timer = setInterval(() => {
    processDue().catch((e) => logger.error("retry", "Worker xatosi", { error: e.message }));
  }, TICK_MS);
  timer.unref?.();
  logger.info("retry", `Retry worker ishga tushdi (har ${TICK_MS / 1000}s)`);
  return timer;
}

function stopRetryWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

/* --------------------------- Admin uchun --------------------------- */
function listJobs({ status, kind, limit = 100, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (kind) {
    where.push("kind = ?");
    args.push(kind);
  }
  const sql = `SELECT * FROM retry_queue ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...args, Math.min(Number(limit) || 100, 500), Number(offset) || 0);
  const total = db
    .prepare(`SELECT COUNT(*) c FROM retry_queue ${where.length ? "WHERE " + where.join(" AND ") : ""}`)
    .get(...args).c;
  return { rows, total };
}

function queueStats() {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM retry_queue GROUP BY status").all();
  const out = { pending: 0, done: 0, dead: 0 };
  for (const r of rows) out[r.status] = r.c;
  out.dueNow = db.prepare("SELECT COUNT(*) c FROM retry_queue WHERE status='pending' AND next_at <= strftime('%s','now')").get().c;
  return out;
}

/** O'lgan (dead) vazifani qo'lda qayta ishga tushirish */
function requeue(id) {
  const info = db
    .prepare("UPDATE retry_queue SET status='pending', attempts=0, next_at=strftime('%s','now'), last_error=NULL WHERE id=?")
    .run(Number(id));
  if (info.changes) logger.info("retry", `Vazifa #${id} qo'lda qayta navbatga qo'yildi`);
  return info.changes > 0;
}

function removeJob(id) {
  return db.prepare("DELETE FROM retry_queue WHERE id=?").run(Number(id)).changes > 0;
}

function clearFinished() {
  return db.prepare("DELETE FROM retry_queue WHERE status IN ('done','dead')").run().changes;
}

module.exports = {
  retryAsync,
  enqueue,
  registerHandler,
  processDue,
  startRetryWorker,
  stopRetryWorker,
  listJobs,
  queueStats,
  requeue,
  removeJob,
  clearFinished,
  backoffMs,
};
