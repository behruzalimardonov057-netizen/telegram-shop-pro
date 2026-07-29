"use strict";
/**
 * Role-based access control (RBAC) — admin panel uchun.
 *
 * Rollar: superadmin > admin > manager > viewer
 * Har bir admin foydalanuvchi bazada saqlanadi (bcrypt hash bilan).
 * .env dagi ADMIN_LOGIN/ADMIN_PASSWORD birinchi superadmin sifatida
 * avtomatik yaratiladi (bootstrap).
 */
const bcrypt = require("bcryptjs");
const { db } = require("./db");
const { config } = require("./config");
const { logger } = require("./logger");

db.exec(`
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'manager',
  perms TEXT,                     -- JSON massiv: rol ustidan qo'shimcha ruxsatlar
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS admin_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT,
  ok INTEGER,
  ip TEXT,
  ua TEXT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_logins_ts ON admin_logins(ts DESC);
`);

/** Barcha mavjud ruxsatlar */
const PERMISSIONS = [
  "dashboard",
  "products",
  "categories",
  "orders",
  "countries",
  "banners",
  "promo",
  "users",
  "broadcast",
  "settings",
  "translations",
  "monitoring",
  "backup",
  "admins",
];

const ROLES = {
  superadmin: PERMISSIONS.slice(),
  admin: PERMISSIONS.filter((p) => !["admins", "backup"].includes(p)),
  manager: ["dashboard", "products", "categories", "orders", "users"],
  viewer: ["dashboard", "orders", "monitoring"],
};

/** Viewer faqat o'qiy oladi */
const READONLY_ROLES = new Set(["viewer"]);

function permsFor(role, extra) {
  const base = ROLES[role] || ROLES.manager;
  let ex = [];
  try {
    ex = extra ? JSON.parse(extra) : [];
  } catch {}
  return [...new Set([...base, ...ex.filter((p) => PERMISSIONS.includes(p))])];
}

/* ------------------------------ CRUD ------------------------------ */
function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    login: r.login,
    name: r.name || "",
    role: r.role,
    perms: permsFor(r.role, r.perms),
    extra_perms: (() => {
      try {
        return r.perms ? JSON.parse(r.perms) : [];
      } catch {
        return [];
      }
    })(),
    active: !!r.active,
    created_at: r.created_at,
    last_login: r.last_login,
    readonly: READONLY_ROLES.has(r.role),
  };
}

const S = {
  byLogin: db.prepare("SELECT * FROM admin_users WHERE login = ?"),
  byId: db.prepare("SELECT * FROM admin_users WHERE id = ?"),
  list: db.prepare("SELECT * FROM admin_users ORDER BY id"),
  count: db.prepare("SELECT COUNT(*) c FROM admin_users"),
  countRole: db.prepare("SELECT COUNT(*) c FROM admin_users WHERE role = ? AND active = 1"),
  insert: db.prepare(
    "INSERT INTO admin_users (login, password_hash, name, role, perms, active) VALUES (?,?,?,?,?,?)"
  ),
  update: db.prepare("UPDATE admin_users SET name=?, role=?, perms=?, active=? WHERE id=?"),
  setPass: db.prepare("UPDATE admin_users SET password_hash=? WHERE id=?"),
  del: db.prepare("DELETE FROM admin_users WHERE id=?"),
  touch: db.prepare("UPDATE admin_users SET last_login=strftime('%s','now') WHERE id=?"),
  logLogin: db.prepare("INSERT INTO admin_logins (login, ok, ip, ua) VALUES (?,?,?,?)"),
  loginHistory: db.prepare("SELECT * FROM admin_logins ORDER BY id DESC LIMIT ?"),
};

/** .env dan birinchi superadmin yaratish */
function bootstrapAdmin() {
  if (S.count.get().c > 0) return;
  const login = config.adminLogin || "admin";
  const hash = config.adminPasswordHash || (config.adminPassword ? bcrypt.hashSync(config.adminPassword, 10) : "");
  if (!hash) {
    logger.warn("auth", "Admin foydalanuvchi yaratilmadi — .env da ADMIN_PASSWORD/ADMIN_PASSWORD_HASH yo'q");
    return;
  }
  S.insert.run(login, hash, "Bosh admin", "superadmin", null, 1);
  logger.info("auth", `Birinchi superadmin yaratildi: ${login}`);
}

function listAdmins() {
  return S.list.all().map(rowToUser);
}

function createAdmin({ login, password, name = "", role = "manager", extra_perms = [], active = true }) {
  if (!ROLES[role]) throw Object.assign(new Error("Noma'lum rol"), { status: 400 });
  if (!password || String(password).length < 8) {
    throw Object.assign(new Error("Parol kamida 8 belgi bo'lishi kerak"), { status: 400 });
  }
  if (S.byLogin.get(login)) throw Object.assign(new Error("Bu login band"), { status: 409 });
  const perms = JSON.stringify((extra_perms || []).filter((p) => PERMISSIONS.includes(p)));
  const info = S.insert.run(login, bcrypt.hashSync(String(password), 10), name, role, perms, active ? 1 : 0);
  logger.info("auth", `Yangi admin yaratildi: ${login} (${role})`);
  return rowToUser(S.byId.get(Number(info.lastInsertRowid)));
}

function updateAdmin(id, { name, role, extra_perms, active, password }, actor) {
  const cur = S.byId.get(Number(id));
  if (!cur) throw Object.assign(new Error("Topilmadi"), { status: 404 });
  const nextRole = role || cur.role;
  if (!ROLES[nextRole]) throw Object.assign(new Error("Noma'lum rol"), { status: 400 });

  // Oxirgi faol superadmin himoyasi
  const losingSuper = cur.role === "superadmin" && (nextRole !== "superadmin" || active === false);
  if (losingSuper && S.countRole.get("superadmin").c <= 1) {
    throw Object.assign(new Error("Oxirgi superadmin rolini o'zgartirib bo'lmaydi"), { status: 400 });
  }
  const perms = JSON.stringify(
    (extra_perms !== undefined ? extra_perms : rowToUser(cur).extra_perms).filter((p) => PERMISSIONS.includes(p))
  );
  S.update.run(
    name !== undefined ? name : cur.name,
    nextRole,
    perms,
    active === undefined ? cur.active : active ? 1 : 0,
    cur.id
  );
  if (password) {
    if (String(password).length < 8) throw Object.assign(new Error("Parol kamida 8 belgi"), { status: 400 });
    S.setPass.run(bcrypt.hashSync(String(password), 10), cur.id);
  }
  logger.info("auth", `Admin yangilandi: ${cur.login}`, { by: actor?.login, role: nextRole });
  return rowToUser(S.byId.get(cur.id));
}

function deleteAdmin(id, actor) {
  const cur = S.byId.get(Number(id));
  if (!cur) throw Object.assign(new Error("Topilmadi"), { status: 404 });
  if (actor && actor.uid === cur.id) throw Object.assign(new Error("O'zingizni o'chira olmaysiz"), { status: 400 });
  if (cur.role === "superadmin" && S.countRole.get("superadmin").c <= 1) {
    throw Object.assign(new Error("Oxirgi superadminni o'chirib bo'lmaydi"), { status: 400 });
  }
  S.del.run(cur.id);
  logger.warn("auth", `Admin o'chirildi: ${cur.login}`, { by: actor?.login });
  return true;
}

/** Login tekshiruvi. Muvaffaqiyatda JWT claim'lari qaytadi. */
function verifyCredentials(login, password, meta = {}) {
  const row = S.byLogin.get(String(login || ""));
  const ok = !!row && !!row.active && bcrypt.compareSync(String(password || ""), row.password_hash || "");
  try {
    S.logLogin.run(String(login || ""), ok ? 1 : 0, meta.ip || null, (meta.ua || "").slice(0, 200));
  } catch {}
  if (!ok) {
    logger.warn("auth", `Kirish muvaffaqiyatsiz: ${login}`, { ip: meta.ip });
    return null;
  }
  S.touch.run(row.id);
  const user = rowToUser(row);
  logger.info("auth", `Kirish: ${row.login} (${row.role})`, { ip: meta.ip });
  return {
    claims: { uid: user.id, login: user.login, role: user.role, perms: user.perms, name: user.name },
    user,
  };
}

function loginHistory(limit = 50) {
  return S.loginHistory.all(Math.min(Number(limit) || 50, 300));
}

/* --------------------------- Middleware --------------------------- */
function hasPerm(claims, perm) {
  if (!claims) return false;
  if (claims.role === "superadmin") return true;
  return Array.isArray(claims.perms) ? claims.perms.includes(perm) : false;
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (!hasPerm(req.admin, perm)) {
      logger.warn("auth", `Ruxsat yo'q: ${req.admin?.login} → ${perm}`, { path: req.originalUrl });
      return res.status(403).json({ error: `Ruxsat yo'q: ${perm}` });
    }
    next();
  };
}

/** URL prefiksi → kerakli ruxsat */
const PERM_MAP = [
  [/^\/admin\/(products|prod)/, "products"],
  [/^\/admin\/categories/, "categories"],
  [/^\/admin\/orders/, "orders"],
  [/^\/admin\/countries/, "countries"],
  [/^\/admin\/banners/, "banners"],
  [/^\/admin\/promo/, "promo"],
  [/^\/admin\/users/, "users"],
  [/^\/admin\/broadcast/, "broadcast"],
  [/^\/admin\/settings/, "settings"],
  [/^\/admin\/translations/, "translations"],
  [/^\/admin\/(logs|monitoring|retry|health)/, "monitoring"],
  [/^\/admin\/backups?/, "backup"],
  [/^\/admin\/admins/, "admins"],
  [/^\/admin\/stats/, "dashboard"],
];

/** Har bir /admin/* so'rovi uchun avtomatik ruxsat tekshiruvi */
function permGuard(req, res, next) {
  const p = req.path;
  if (!p.startsWith("/admin/") || p === "/admin/login" || p === "/admin/session") return next();
  if (!req.admin) return next(); // adminAuth o'zi 401 qaytaradi
  if (READONLY_ROLES.has(req.admin.role) && req.method !== "GET") {
    return res.status(403).json({ error: "Sizda faqat ko'rish huquqi bor" });
  }
  const hit = PERM_MAP.find(([re]) => re.test(p));
  if (!hit) return next();
  if (!hasPerm(req.admin, hit[1])) {
    logger.warn("auth", `Ruxsat yo'q: ${req.admin.login} → ${hit[1]}`, { path: p, method: req.method });
    return res.status(403).json({ error: `Ruxsat yo'q: ${hit[1]}` });
  }
  next();
}

bootstrapAdmin();

module.exports = {
  PERMISSIONS,
  ROLES,
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  verifyCredentials,
  loginHistory,
  hasPerm,
  requirePerm,
  permGuard,
  bootstrapAdmin,
};
