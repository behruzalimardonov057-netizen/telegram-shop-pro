"use strict";
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { config } = require("./config");
const { q } = require("./db");

function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Telegram WebApp initData ni tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData, botToken = config.botToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    params.delete("signature");

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (!safeEqualHex(computed, hash)) return null;

    // Eskirgan initData'ni rad etamiz (replay-attack himoyasi)
    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate) return null;
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > config.initDataMaxAgeSec || age < -300) return null;

    const rawUser = params.get("user");
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    if (!user || typeof user.id !== "number") return null;
    return user;
  } catch {
    return null;
  }
}

function tgAuth(req, res, next) {
  const initData = req.get("x-telegram-init-data") || "";
  let user = verifyInitData(initData);

  if (!user && config.allowDevAuth && !config.isProd) {
    const devId = Number(req.get("x-dev-user"));
    if (devId) user = { id: devId, first_name: "Dev", username: "dev" };
  }
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const row = q.getUser.get(user.id);
  if (row?.blocked) return res.status(403).json({ error: "Blocked" });

  req.user = user;
  req.dbUser = row || null;
  next();
}

function signAdminToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "12h" });
}

const KNOWN_ROLES = ["superadmin", "admin", "manager", "viewer"];

function adminAuth(req, res, next) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    if (!KNOWN_ROLES.includes(claims.role)) return res.status(403).json({ error: "Forbidden" });
    req.admin = claims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { verifyInitData, tgAuth, signAdminToken, adminAuth };
