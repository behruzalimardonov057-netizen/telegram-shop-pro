"use strict";
/**
 * SQLite zaxira (backup) va tiklash (restore) tizimi.
 *
 * - Onlayn zaxira: better-sqlite3 `db.backup()` — server to'xtatilmaydi.
 * - Avtomatik jadval bo'yicha zaxira + eskilarini tozalash.
 * - Tiklash: joriy baza avval "safety" nusxaga olinadi, so'ng fayl
 *   almashtiriladi va jarayon qayta ishga tushadi (pm2/systemd/docker restart).
 */
const fs = require("fs");
const path = require("path");
const { db, DB_FILE } = require("./db");
const { logger } = require("./logger");

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), "backups");
const KEEP = Number(process.env.BACKUP_KEEP) || 20;
const AUTO_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS) || 12;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const SAFE_NAME = /^[A-Za-z0-9._-]+\.db$/;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function resolveBackup(name) {
  if (!SAFE_NAME.test(String(name || ""))) throw new Error("Noto'g'ri fayl nomi");
  const full = path.join(BACKUP_DIR, name);
  if (!full.startsWith(BACKUP_DIR)) throw new Error("Noto'g'ri yo'l");
  if (!fs.existsSync(full)) throw new Error("Zaxira fayli topilmadi");
  return full;
}

/** Zaxira yaratish. reason: manual | auto | pre-restore */
async function createBackup(reason = "manual", by = "system") {
  const name = `shop_${reason}_${stamp()}.db`;
  const dest = path.join(BACKUP_DIR, name);
  await db.backup(dest);
  const size = fs.statSync(dest).size;
  logger.info("backup", `Zaxira yaratildi: ${name} (${(size / 1024).toFixed(1)} KB)`, { reason, by });
  pruneBackups();
  return { name, size, reason, created_at: Math.floor(Date.now() / 1000) };
}

function listBackups() {
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        name: f,
        size: st.size,
        created_at: Math.floor(st.mtimeMs / 1000),
        reason: (f.split("_")[1] || "manual"),
      };
    })
    .sort((a, b) => b.created_at - a.created_at);
}

/** KEEP dan ortiq eski zaxiralarni o'chirish (pre-restore nusxalari saqlanadi) */
function pruneBackups() {
  const items = listBackups().filter((b) => b.reason !== "pre-restore");
  const extra = items.slice(KEEP);
  for (const b of extra) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, b.name));
      logger.info("backup", `Eski zaxira o'chirildi: ${b.name}`);
    } catch (e) {
      logger.warn("backup", `O'chirib bo'lmadi: ${b.name}`, { error: e.message });
    }
  }
  return extra.length;
}

function deleteBackup(name) {
  const full = resolveBackup(name);
  fs.unlinkSync(full);
  logger.warn("backup", `Zaxira o'chirildi: ${name}`);
  return true;
}

function backupPath(name) {
  return resolveBackup(name);
}

/** Yuklangan fayl haqiqiy SQLite bazasi ekanini tekshirish */
function validateSqliteFile(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    if (buf.toString("utf8", 0, 15) !== "SQLite format 3") throw new Error("Fayl SQLite bazasi emas");
  } finally {
    fs.closeSync(fd);
  }
  // Muhim jadvallar mavjudmi?
  const Database = require("better-sqlite3");
  const probe = new Database(filePath, { readonly: true });
  try {
    const names = probe
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    for (const req of ["products", "orders", "users", "settings"]) {
      if (!names.includes(req)) throw new Error(`Zaxirada '${req}' jadvali yo'q — mos kelmaydi`);
    }
  } finally {
    probe.close();
    // readonly ochilishdan qolgan yordamchi fayllarni tozalaymiz
    for (const suffix of ["-wal", "-shm"]) {
      const f = filePath + suffix;
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }
  return true;
}

/** Tashqi fayldan zaxira import qilish (yuklab olingan .db) */
function importBackup(tmpPath, originalName = "uploaded.db") {
  validateSqliteFile(tmpPath);
  const name = `shop_upload_${stamp()}.db`;
  fs.copyFileSync(tmpPath, path.join(BACKUP_DIR, name));
  try {
    fs.unlinkSync(tmpPath);
  } catch {}
  logger.info("backup", `Zaxira yuklandi: ${originalName} → ${name}`);
  return { name };
}

/**
 * Zaxiradan tiklash.
 * Jarayon: pre-restore nusxa → baza yopiladi → fayl almashtiriladi →
 * process.exit(0) (supervisor qayta ishga tushiradi).
 */
async function restoreBackup(name, by = "system") {
  const src = resolveBackup(name);
  validateSqliteFile(src);

  const safety = await createBackup("pre-restore", by);
  logger.warn("backup", `Tiklash boshlandi: ${name}`, { safety: safety.name, by });

  // Bazani yopishdan OLDIN yozamiz — keyin log yozib bo'lmaydi
  logger.info("backup", `Tiklanmoqda: ${name}. Server qayta ishga tushadi…`, { by });

  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();

  for (const suffix of ["-wal", "-shm"]) {
    const f = DB_FILE + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.copyFileSync(src, DB_FILE);

  console.log(`✅ Tiklandi: ${name}. Server qayta ishga tushmoqda…`);
  setTimeout(() => process.exit(0), 400);
  return { ok: true, restored: name, safety: safety.name, restarting: true };
}

let autoTimer = null;
function startAutoBackup() {
  if (autoTimer || AUTO_HOURS <= 0) return null;
  const ms = AUTO_HOURS * 3600 * 1000;
  autoTimer = setInterval(() => {
    createBackup("auto").catch((e) => logger.error("backup", "Avto-zaxira xatosi", { error: e.message }));
  }, ms);
  autoTimer.unref?.();
  logger.info("backup", `Avto-zaxira yoqildi: har ${AUTO_HOURS} soatda (oxirgi ${KEEP} nusxa saqlanadi)`);
  return autoTimer;
}

module.exports = {
  BACKUP_DIR,
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
  importBackup,
  pruneBackups,
  backupPath,
  startAutoBackup,
  validateSqliteFile,
};
