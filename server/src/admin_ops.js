"use strict";
/**
 * Admin panel qo'shimcha modullari:
 *  - /api/admin/backups*   — zaxira yaratish / tiklash / yuklab olish
 *  - /api/admin/logs*      — monitoring (tranzaksiya va bot xatolari)
 *  - /api/admin/retry*     — qayta urinish navbati
 *  - /api/admin/admins*    — role-based admin foydalanuvchilar
 */
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const multer = require("multer");
const { z } = require("zod");

const { db } = require("./db");
const { adminAuth } = require("./auth");
const roles = require("./roles");
const { logger, listLogs, logStats, clearLogs, pruneLogs, LEVELS } = require("./logger");
const retry = require("./retry");
const backup = require("./backup");

const router = express.Router();
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (source === "body") req.body = parsed.data;
    else req.vquery = parsed.data;
    next();
  };
}

/* ============================ BACKUP ============================ */
const uploadBackup = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

router.get("/admin/backups", adminAuth, roles.requirePerm("backup"), (req, res) => {
  res.json({ dir: backup.BACKUP_DIR, items: backup.listBackups() });
});

router.post(
  "/admin/backups",
  adminAuth,
  roles.requirePerm("backup"),
  asyncH(async (req, res) => {
    const info = await backup.createBackup("manual", req.admin.login);
    res.json(info);
  })
);

router.get("/admin/backups/:name/download", adminAuth, roles.requirePerm("backup"), (req, res) => {
  const full = backup.backupPath(req.params.name);
  logger.info("backup", `Zaxira yuklab olindi: ${req.params.name}`, { by: req.admin.login });
  res.download(full, path.basename(full));
});

router.post(
  "/admin/backups/upload",
  adminAuth,
  roles.requirePerm("backup"),
  (req, res) => {
    uploadBackup.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: "Fayl yuborilmadi" });
      try {
        res.json(backup.importBackup(req.file.path, req.file.originalname));
      } catch (e) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        res.status(400).json({ error: e.message });
      }
    });
  }
);

router.post(
  "/admin/backups/:name/restore",
  adminAuth,
  roles.requirePerm("backup"),
  asyncH(async (req, res) => {
    if (req.admin.role !== "superadmin") return res.status(403).json({ error: "Faqat superadmin tiklay oladi" });
    const result = await backup.restoreBackup(req.params.name, req.admin.login);
    res.json({
      ...result,
      message: "Baza tiklandi. Server qayta ishga tushmoqda — 5-10 soniyadan keyin sahifani yangilang.",
    });
  })
);

router.delete("/admin/backups/:name", adminAuth, roles.requirePerm("backup"), (req, res) => {
  backup.deleteBackup(req.params.name);
  res.json({ ok: true });
});

/* =========================== MONITORING =========================== */
const logQuery = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  source: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  since: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/admin/logs", adminAuth, roles.requirePerm("monitoring"), validate(logQuery, "query"), (req, res) => {
  res.json(listLogs(req.vquery));
});

router.get("/admin/logs/stats", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  res.json({
    ...logStats(),
    queue: retry.queueStats(),
    levels: LEVELS,
    sources: db.prepare("SELECT DISTINCT source FROM logs ORDER BY source").all().map((r) => r.source),
  });
});

router.delete("/admin/logs", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  if (req.admin.role === "viewer") return res.status(403).json({ error: "Ruxsat yo'q" });
  const removed = clearLogs(req.query.level);
  logger.warn("system", `Loglar tozalandi (${removed} yozuv)`, { by: req.admin.login });
  res.json({ removed });
});

router.get("/admin/health", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: Math.floor(process.uptime()),
    node: process.version,
    memory_mb: Math.round(mem.rss / 1048576),
    heap_mb: Math.round(mem.heapUsed / 1048576),
    db_size: (() => {
      try {
        return fs.statSync(require("./db").DB_FILE).size;
      } catch {
        return 0;
      }
    })(),
    queue: retry.queueStats(),
    backups: backup.listBackups().length,
    logins: roles.loginHistory(20),
  });
});

/* ============================= RETRY ============================= */
router.get("/admin/retry", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  res.json({
    ...retry.listJobs({ status: req.query.status, kind: req.query.kind, limit: req.query.limit }),
    stats: retry.queueStats(),
  });
});

router.post("/admin/retry/:id/requeue", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  res.json({ ok: retry.requeue(req.params.id) });
});

router.delete("/admin/retry/:id", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  res.json({ ok: retry.removeJob(req.params.id) });
});

router.post("/admin/retry/run", adminAuth, roles.requirePerm("monitoring"), asyncH(async (req, res) => {
  res.json(await retry.processDue(50));
}));

router.post("/admin/retry/clear", adminAuth, roles.requirePerm("monitoring"), (req, res) => {
  res.json({ removed: retry.clearFinished() });
});

/* ======================= ADMIN FOYDALANUVCHILAR ======================= */
const adminSchema = z.object({
  login: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Faqat harf, raqam, . _ -"),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(80).default(""),
  role: z.enum(["superadmin", "admin", "manager", "viewer"]),
  extra_perms: z.array(z.string().max(40)).default([]),
  active: z.coerce.boolean().default(true),
});

const adminUpdateSchema = adminSchema.partial().omit({ login: true }).extend({
  password: z.string().min(8).max(200).optional().or(z.literal("")),
});

router.get("/admin/admins", adminAuth, roles.requirePerm("admins"), (req, res) => {
  res.json({ items: roles.listAdmins(), permissions: roles.PERMISSIONS, roles: roles.ROLES });
});

router.post("/admin/admins", adminAuth, roles.requirePerm("admins"), validate(adminSchema), (req, res) => {
  res.json(roles.createAdmin(req.body));
});

router.put("/admin/admins/:id", adminAuth, roles.requirePerm("admins"), validate(adminUpdateSchema), (req, res) => {
  const body = { ...req.body };
  if (!body.password) delete body.password;
  res.json(roles.updateAdmin(req.params.id, body, req.admin));
});

router.delete("/admin/admins/:id", adminAuth, roles.requirePerm("admins"), (req, res) => {
  roles.deleteAdmin(req.params.id, req.admin);
  res.json({ ok: true });
});

/** O'z parolini o'zgartirish — barcha rollar uchun */
router.post(
  "/admin/me/password",
  adminAuth,
  validate(z.object({ current: z.string().min(1), password: z.string().min(8).max(200) })),
  (req, res) => {
    const ok = roles.verifyCredentials(req.admin.login, req.body.current, { ip: req.ip });
    if (!ok) return res.status(401).json({ error: "Joriy parol noto'g'ri" });
    roles.updateAdmin(req.admin.uid, { password: req.body.password }, req.admin);
    res.json({ ok: true });
  }
);

/* ---------------- Xatoliklar ---------------- */
router.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) logger.error("api", `Admin modul xatosi: ${err.message}`, { path: req.originalUrl });
  res.status(status).json({ error: err.message || "Server xatosi" });
});

module.exports = router;
