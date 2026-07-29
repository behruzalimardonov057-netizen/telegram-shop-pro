"use strict";
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const { config, assertConfig } = require("./config");
assertConfig();

const api = require("./api");
const adminOps = require("./admin_ops");
const { startBot, getBot, notifyNewOrder, notifyOrderStatus, sendOnce } = require("./bot");
const { q } = require("./db");
const { logger, pruneLogs } = require("./logger");
const retry = require("./retry");
const backup = require("./backup");
const scheduler = require("./scheduler");

/* ---------- Retry navbati uchun ishlovchilar ---------- */
retry.registerHandler("tg_send", async ({ chatId, text, opts }) => {
  await sendOnce(chatId, text, opts || {});
});
retry.registerHandler("order_notify", async ({ orderId }) => {
  const order = q.getOrder.get(Number(orderId));
  if (!order) throw new Error(`Buyurtma #${orderId} topilmadi`);
  notifyNewOrder(order);
});
retry.registerHandler("status_notify", async ({ orderId, comment }) => {
  const order = q.getOrder.get(Number(orderId));
  if (!order) throw new Error(`Buyurtma #${orderId} topilmadi`);
  await notifyOrderStatus(order, comment);
});
retry.registerHandler("webhook_update", async ({ update }) => {
  const bot = getBot();
  if (!bot) throw new Error("Bot ishga tushmagan");
  bot.processUpdate(update);
});

const ROOT = path.join(__dirname, "..", "..");
const app = express();

if (config.trustProxy) app.set("trust proxy", 1);
app.disable("x-powered-by");

// Telegram Mini App CDN'lardan (tailwind, esm.sh) foydalanadi va Telegram
// ichida iframe'da ochiladi — CSP shunga moslangan.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://telegram.org", "https://cdn.tailwindcss.com", "https://esm.sh"],
        "connect-src": ["'self'", "https://esm.sh"],
        "img-src": ["'self'", "data:", "https:"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        "frame-ancestors": ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
        "upgrade-insecure-requests": [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression());
app.use(
  cors({
    origin: config.publicUrl ? [config.publicUrl] : true,
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Umumiy API limiti
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p so'rov. Biroz kuting." },
  })
);

app.get("/healthz", (req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()) }));

app.use("/uploads", express.static(path.join(ROOT, "uploads"), { maxAge: "30d", index: false, dotfiles: "deny" }));
app.use(express.static(path.join(ROOT, "public"), { maxAge: "1h", index: false }));

app.use("/api", adminOps);
app.use("/api", api);

// Telegram webhook (USE_WEBHOOK=1 bo'lganda)
if (config.useWebhook) {
  app.post(config.webhookPath, (req, res) => {
    // Telegram 200 kutadi — xatolik bo'lsa update navbatga tushadi va
    // avtomatik qayta qayta ishlanadi (takroriy yuborish oldini oladi).
    res.sendStatus(200);
    try {
      const bot = getBot();
      if (!bot) throw new Error("Bot ishga tushmagan");
      bot.processUpdate(req.body);
    } catch (e) {
      logger.error("webhook", `Update qayta ishlanmadi: ${e.message}`, { update_id: req.body?.update_id });
      retry.enqueue("webhook_update", { update: req.body }, { refId: String(req.body?.update_id || "") });
    }
  });
}

app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "public", "admin.html")));

// Mini App SPA fallback (API va uploads bundan tashqari)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Markazlashgan xatoliklar
app.use((err, req, res, next) => {
  const st = err.status || 500;
  if (st >= 500) logger.error("api", `${req.method} ${req.originalUrl} — ${err.message}`, { stack: (err.stack || "").split("\n").slice(0, 3).join(" | ") });
  else logger.warn("api", `${req.method} ${req.originalUrl} — ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({ error: config.isProd && status === 500 ? "Server xatosi" : err.message });
});

const server = app.listen(config.port, () => {
  console.log(`🌐 Server http://localhost:${config.port}`);
  if (config.publicUrl) console.log(`🔗 Public: ${config.publicUrl}`);
});

startBot();
retry.startRetryWorker();
backup.startAutoBackup();
try { scheduler.startScheduler(getBot()); } catch(e) { logger.warn("system", `Scheduler: ${e.message}`); }

// Ishga tushishda kutilayotgan navbatni darhol bir marta ko'rib chiqamiz
setTimeout(() => retry.processDue(50).catch(() => {}), 3000).unref();
// Har 6 soatda eski loglarni tozalash
setInterval(() => pruneLogs(), 6 * 3600 * 1000).unref();

logger.info("system", `Server ishga tushdi (port ${config.port}, ${config.useWebhook ? "webhook" : "polling"} rejimi)`);

function shutdown(signal) {
  console.log(`\n${signal} — to'xtatilmoqda...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => logger.error("system", `unhandledRejection: ${e?.message || e}`));
process.on("uncaughtException", (e) => logger.error("system", `uncaughtException: ${e?.message || e}`, { stack: (e?.stack || "").split("\n").slice(0, 4).join(" | ") }));
