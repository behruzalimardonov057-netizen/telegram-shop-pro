"use strict";
const crypto = require("crypto");

function bool(v, def = false) {
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const isProd = (process.env.NODE_ENV || "production") === "production";

// PUBLIC_URL berilmagan bo'lsa Railway avtomatik bergan domendan foydalanamiz.
// Aks holda Mini App tugmasi noto'g'ri manzilga ishora qiladi va 404 chiqadi.
function resolvePublicUrl() {
  const explicit = (process.env.PUBLIC_URL || "").trim();
  const railway =
    (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim() ||
    (process.env.RAILWAY_STATIC_URL || "").trim();
  let url = explicit || (railway ? (railway.startsWith("http") ? railway : `https://${railway}`) : "");
  url = url.replace(/\/+$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  botToken: (process.env.BOT_TOKEN || "").trim(),
  publicUrl: resolvePublicUrl(),
  adminIds: (process.env.ADMIN_TG_IDS || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  ordersChatId: (process.env.ORDERS_CHAT_ID || "").trim() || null,
  adminLogin: process.env.ADMIN_LOGIN || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  jwtSecret: process.env.JWT_SECRET || "",
  shopName: process.env.SHOP_NAME || "Shop",
  currency: process.env.CURRENCY || "UZS",
  useWebhook: bool(process.env.USE_WEBHOOK, false),
  allowDevAuth: bool(process.env.ALLOW_DEV_AUTH, false),
  initDataMaxAgeSec: Number(process.env.INITDATA_MAX_AGE) || 24 * 60 * 60,
  trustProxy: bool(process.env.TRUST_PROXY, true),
  // --- Kanal, majburiy obuna, telefon ---
  channelUsername: (process.env.CHANNEL_USERNAME || "shop_kanali").trim().replace(/^@/, ""),
  botUsername: (process.env.BOT_USERNAME || "").trim().replace(/^@/, ""),
  requireSubscription: bool(process.env.REQUIRE_SUBSCRIPTION, true),
  requirePhone: bool(process.env.REQUIRE_PHONE, true),
  postProductsToChannel: bool(process.env.POST_PRODUCTS_TO_CHANNEL, true),
};
config.channelId = (process.env.CHANNEL_ID || `@${config.channelUsername}`).trim();

// Webhook uchun maxfiy yo'l (token'dan deterministik hosil qilinadi)
config.webhookPath =
  "/tg/" +
  crypto
    .createHash("sha256")
    .update("webhook:" + (config.botToken || "none"))
    .digest("hex")
    .slice(0, 32);

const problems = [];
const warnings = [];

if (!config.botToken) problems.push("BOT_TOKEN yo'q — bot ishga tushmaydi.");
if (!config.jwtSecret || config.jwtSecret.length < 24) {
  problems.push("JWT_SECRET yo'q yoki juda qisqa (kamida 24 belgi). `openssl rand -hex 32`.");
}
if (!config.adminPasswordHash && !config.adminPassword) {
  problems.push("ADMIN_PASSWORD yoki ADMIN_PASSWORD_HASH belgilanmagan.");
}
if (!config.adminPasswordHash && config.adminPassword.length < 10) {
  problems.push("ADMIN_PASSWORD juda zaif (kamida 10 belgi).");
}
if (!config.publicUrl.startsWith("https://")) {
  warnings.push("PUBLIC_URL HTTPS emas — Telegram Mini App tugmasi ko'rinmaydi.");
}
if (!config.adminIds.length) warnings.push("ADMIN_TG_IDS bo'sh — botdan admin xabarlari kelmaydi.");
if (config.allowDevAuth) warnings.push("ALLOW_DEV_AUTH=1 — faqat lokal test uchun! Prod'da o'chiring.");

function assertConfig() {
  for (const w of warnings) console.warn("⚠️  " + w);
  if (problems.length) {
    console.error("\n❌ Sozlamalarda xatolik:\n" + problems.map((p) => "   • " + p).join("\n") + "\n");
    if (config.isProd) process.exit(1);
  }
}

module.exports = { config, assertConfig };
