"use strict";
/**
 * Telegram bot ichidagi ADMIN PANEL (v5).
 *
 * Yangi:
 *  • Buyurtmalar — paginatsiya (1/N) + filtrlar (status, sana, qidiruv).
 *  • Inline menyu — tezroq navigatsiya (breadcrumb + shortcuts).
 *  • Loglarni ZIP qilib eksport qilish (loglar + audit + monitoring xulosasi).
 *  • Tiklash (restore) — 2 bosqichli tasdiq (kod yozish shart).
 *  • Barcha admin amallari — audit jurnaliga yoziladi (kim, qachon, nima).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("./config");
const { db, q, getSettings } = require("./db");
const { logger, listLogs, logStats, clearLogs, onError } = require("./logger");
const retry = require("./retry");
const backup = require("./backup");
const { botAudit, listAudit } = require("./audit");
const { buildZip } = require("./zip");
const scheduler = require("./scheduler");
const roles = require("./roles");
const { saveSettings } = require("./db");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const dt = (ts) => new Date(Number(ts) * 1000).toLocaleString("ru-RU");
const isAdmin = (id) => config.adminIds.includes(Number(id));

/* Uzun stringlar (fayl nomlari, filter qiymatlari) uchun callback_data xarita */
const tokens = new Map();
function tok(name) {
  const t = "t" + (tokens.size + 1).toString(36) + Date.now().toString(36).slice(-4);
  tokens.set(t, name);
  if (tokens.size > 500) tokens.delete(tokens.keys().next().value);
  return t;
}

/* Buyurtma filtrlari — session (adminId -> filter) */
const orderFilters = new Map(); // { status, days, search, page }
function getFilter(id) {
  if (!orderFilters.has(id)) orderFilters.set(id, { status: "all", days: 0, search: "", page: 1 });
  return orderFilters.get(id);
}

/* Audit filtrlari — session (adminId -> filter) */
const auditFilters = new Map();
function getAuditFilter(id) {
  if (!auditFilters.has(id)) auditFilters.set(id, { actor: "", action: "", days: 0, search: "", page: 1 });
  return auditFilters.get(id);
}
const AUDIT_PAGE = 8;

/* Restore — 2 bosqichli tasdiq (adminId -> { name, code, exp }) */
const restoreConfirm = new Map();
function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* --------------------------- Ekranlar --------------------------- */

function menuScreen() {
  const s = getSettings();
  const st = retry.queueStats();
  const errors = logStats().last24h.byLevel.error || 0;
  return {
    text:
      `👨‍💼 <b>${esc(s.shop_name)} — Admin panel</b>\n\n` +
      `👥 Foydalanuvchilar: <b>${q.countUsers.get().c}</b>\n` +
      `👕 Mahsulotlar: <b>${q.countProducts.get().c}</b>\n` +
      `📦 Buyurtmalar: <b>${q.countOrders.get().c}</b>\n` +
      `💰 Aylanma: <b>${money(q.revenueSum.get().s)}</b> ${esc(s.currency)}\n\n` +
      `❌ 24 soatlik xatolar: <b>${errors}</b>\n` +
      `🔁 Navbatda: <b>${st.pending}</b> · o'lik: <b>${st.dead}</b>\n\n` +
      `🌐 Veb-panel: ${esc(config.publicUrl || "-")}/admin`,
    keyboard: [
      [{ text: "➕ Mahsulot qo'shish (suratlar bilan)", callback_data: "pw:new" }],
      [
        { text: "📦 Buyurtmalar", callback_data: "adm:orders" },
        { text: "🩺 Monitoring", callback_data: "adm:mon" },
      ],
      [
        { text: "❌ Xatolar", callback_data: "adm:errors" },
        { text: "🔁 Navbat", callback_data: "adm:queue" },
      ],
      [
        { text: "💾 Zaxira", callback_data: "adm:backups" },
        { text: "📥 Loglar ZIP", callback_data: "adm:logzip" },
      ],
      [
        { text: "🧾 Audit", callback_data: "adm:audit" },
        { text: "🖥 Server holati", callback_data: "adm:health" },
      ],
      [
        { text: "🛡 Rollar (RBAC)", callback_data: "adm:rbac" },
        { text: "📊 Kunlik hisobot", callback_data: "adm:rpt" },
      ],
      [{ text: "🔄 Yangilash", callback_data: "adm:menu" }],
    ],
  };
}

/* -------- Buyurtmalar: paginatsiya + filtrlar -------- */

const STATUS_LABELS = {
  all: "Barchasi", new: "🆕 Yangi", pending: "⏳ Kutilmoqda",
  paid: "💳 To'langan", shipped: "🚚 Yuborilgan", done: "✅ Yakunlangan",
  cancelled: "❌ Bekor",
};
const STATUS_KEYS = Object.keys(STATUS_LABELS);
const DAYS_LABELS = { 0: "Barcha vaqt", 1: "Bugun", 7: "7 kun", 30: "30 kun" };
const PAGE_SIZE = 6;

function queryOrders(filter) {
  const where = []; const args = [];
  if (filter.status && filter.status !== "all") {
    where.push("o.status = ?"); args.push(filter.status);
  }
  if (Number(filter.days) > 0) {
    const since = Math.floor(Date.now()/1000) - Number(filter.days)*86400;
    where.push("o.created_at >= ?"); args.push(since);
  }
  if (filter.search) {
    where.push("(CAST(o.id AS TEXT) LIKE ? OR IFNULL(o.name,'') LIKE ? OR IFNULL(o.phone,'') LIKE ? OR IFNULL(u.username,'') LIKE ?)");
    const like = `%${filter.search}%`; args.push(like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(
    `SELECT COUNT(*) c FROM orders o LEFT JOIN users u ON u.tg_id=o.user_id ${w}`
  ).get(...args).c;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(filter.page) || 1), pages);
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT o.*, u.username, u.first_name
     FROM orders o LEFT JOIN users u ON u.tg_id=o.user_id
     ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`
  ).all(...args, PAGE_SIZE, offset);
  return { rows, total, page, pages };
}

function ordersScreen(adminId) {
  const s = getSettings();
  const f = getFilter(adminId);
  const { rows, total, page, pages } = queryOrders(f);
  f.page = page;

  const body = rows.length
    ? rows.map((o) =>
        `#${o.id} · <b>${esc(o.status)}</b> · ${money(o.total)} ${esc(s.currency)}\n` +
        `   👤 ${esc(o.name || o.first_name || o.username || o.user_id)} · 📞 ${esc(o.phone || "-")}\n` +
        `   <i>${dt(o.created_at)}</i>`
      ).join("\n\n")
    : "Filtr bo'yicha buyurtma topilmadi.";

  const filterLine =
    `🔎 <b>Filtr</b>: status = <code>${esc(STATUS_LABELS[f.status] || f.status)}</code>` +
    ` · davr = <code>${esc(DAYS_LABELS[f.days] || f.days + "k")}</code>` +
    (f.search ? ` · qidiruv = <code>${esc(f.search)}</code>` : "");

  /* Sahifa navigatsiyasi */
  const nav = [];
  if (pages > 1) {
    nav.push({ text: page > 1 ? "⏮" : "·", callback_data: page > 1 ? "adm:opg:1" : "adm:noop" });
    nav.push({ text: page > 1 ? "◀️" : "·", callback_data: page > 1 ? `adm:opg:${page-1}` : "adm:noop" });
    nav.push({ text: `${page}/${pages}`, callback_data: "adm:noop" });
    nav.push({ text: page < pages ? "▶️" : "·", callback_data: page < pages ? `adm:opg:${page+1}` : "adm:noop" });
    nav.push({ text: page < pages ? "⏭" : "·", callback_data: page < pages ? `adm:opg:${pages}` : "adm:noop" });
  }

  /* Filtr tugmalari */
  const statusRow1 = STATUS_KEYS.slice(0, 4).map((k) => ({
    text: (f.status === k ? "🔘 " : "") + STATUS_LABELS[k].replace(/^\p{Emoji}\s?/u, "").slice(0, 10),
    callback_data: `adm:ost:${k}`,
  }));
  const statusRow2 = STATUS_KEYS.slice(4).map((k) => ({
    text: (f.status === k ? "🔘 " : "") + STATUS_LABELS[k].replace(/^\p{Emoji}\s?/u, "").slice(0, 10),
    callback_data: `adm:ost:${k}`,
  }));
  const daysRow = Object.keys(DAYS_LABELS).map((d) => ({
    text: (String(f.days) === d ? "🔘 " : "") + DAYS_LABELS[d],
    callback_data: `adm:oda:${d}`,
  }));

  return {
    text:
      `📦 <b>Buyurtmalar</b> (jami: ${total})\n${filterLine}\n\n${body}\n\n` +
      `Sahifa: <b>${page}/${pages}</b>\n` +
      `Qidiruv uchun: <code>/find MATN</code> · Tozalash: <code>/clearfilter</code>`,
    keyboard: [
      statusRow1,
      statusRow2,
      daysRow,
      nav.length ? nav : [{ text: "🔄 Yangilash", callback_data: "adm:orders" }],
      [{ text: "📤 CSV eksport", callback_data: "adm:ocsv" }, { text: "🧹 Filtrni tozalash", callback_data: "adm:oclr" }],
      [{ text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function ordersCsv(filter) {
  /* Filter bilan barcha (yoki eng ko'pi 5000 ta) qatorni CSV qilamiz */
  const f = { ...filter, page: 1 };
  const rows = [];
  let page = 1;
  while (true) {
    f.page = page;
    const r = queryOrders(f);
    rows.push(...r.rows);
    if (page >= r.pages || rows.length >= 5000) break;
    page++;
  }
  const header = "id,status,total,payment,name,phone,country_id,city,user_id,username,created_at\n";
  const body = rows.map((o) =>
    [o.id, o.status, o.total, o.payment, o.name, o.phone, o.country_id, o.city, o.user_id, o.username, new Date(o.created_at*1000).toISOString()]
      .map((v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
  ).join("\n");
  return Buffer.from(header + body, "utf8");
}

/* -------- Monitoring / loglar -------- */

function monScreen() {
  const s = logStats();
  const bySource = s.last24h.bySource.map((r) => `• <code>${esc(r.source)}</code> — ${r.c}`).join("\n") || "—";
  const lvl = s.last24h.byLevel;
  return {
    text:
      `🩺 <b>Monitoring — oxirgi 24 soat</b>\n\n` +
      `❌ Xato: <b>${lvl.error || 0}</b>\n` +
      `⚠️ Ogohlantirish: <b>${lvl.warn || 0}</b>\n` +
      `ℹ️ Ma'lumot: <b>${lvl.info || 0}</b>\n` +
      `🗃 Jami loglar: <b>${s.total}</b>\n\n` +
      `<b>Manbalar bo'yicha:</b>\n${bySource}`,
    keyboard: [
      [
        { text: "❌ Xatolar", callback_data: "adm:errors" },
        { text: "🤖 Bot loglari", callback_data: "adm:logs:bot" },
      ],
      [
        { text: "📦 Buyurtma loglari", callback_data: "adm:logs:order" },
        { text: "🌐 Webhook", callback_data: "adm:logs:webhook" },
      ],
      [{ text: "📥 Hammasini ZIP", callback_data: "adm:logzip" }, { text: "🧹 Loglarni tozalash", callback_data: "adm:logsclear" }],
      [{ text: "🧾 Audit", callback_data: "adm:audit" }, { text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function logsScreen(source, level) {
  const { rows, total } = listLogs({ source, level, limit: 10 });
  const icon = { debug: "·", info: "ℹ️", warn: "⚠️", error: "❌" };
  const body =
    rows.map((r) => {
      const meta = r.meta && r.meta.length < 220 ? `\n   <code>${esc(r.meta)}</code>` : "";
      return `${icon[r.level] || "·"} <i>${dt(r.ts)}</i> · <code>${esc(r.source)}</code>\n   ${esc(r.message)}${meta}`;
    }).join("\n\n") || "Log yo'q ✅";
  const title = level === "error" ? "❌ Oxirgi xatolar" : `📄 Loglar — ${source || "hammasi"}`;
  return {
    text: `${title} (jami: ${total})\n\n${body}`,
    keyboard: [
      [{ text: "📥 ZIP eksport", callback_data: "adm:logzip" }],
      [{ text: "🔄 Yangilash", callback_data: level === "error" ? "adm:errors" : `adm:logs:${source || "all"}` }],
      [{ text: "🩺 Monitoring", callback_data: "adm:mon" }, { text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

const AUDIT_DAYS = { 0: "Barcha vaqt", 1: "Bugun", 7: "7 kun", 30: "30 kun" };

function queryAudit(f) {
  const since = Number(f.days) > 0 ? Math.floor(Date.now()/1000) - Number(f.days)*86400 : undefined;
  const combined = [f.action, f.search].filter(Boolean).join(" ");
  const { rows, total } = listAudit({
    actor: f.actor || undefined,
    action: combined || undefined,
    since,
    limit: 500,
  });
  const pages = Math.max(1, Math.ceil(rows.length / AUDIT_PAGE));
  const page  = Math.min(Math.max(1, Number(f.page) || 1), pages);
  const slice = rows.slice((page-1)*AUDIT_PAGE, page*AUDIT_PAGE);
  return { rows: slice, page, pages, total, filtered: rows.length };
}

function auditScreen(adminId) {
  const f = getAuditFilter(adminId);
  const { rows, page, pages, total, filtered } = queryAudit(f);
  f.page = page;
  const body = rows.length
    ? rows.map((r) =>
        `<i>${dt(r.ts)}</i> · <b>${esc(r.actor_type)}</b>:${esc(r.actor_name || r.actor_id || "?")}\n` +
        `   → <code>${esc(r.action)}</code>${r.target ? ` · ${esc(r.target)}` : ""}`
      ).join("\n\n")
    : "Filtr bo'yicha yozuv topilmadi.";
  const filterLine =
    `🔎 <b>Filtr</b>: davr = <code>${esc(AUDIT_DAYS[f.days] || f.days+"k")}</code>` +
    (f.actor  ? ` · admin = <code>${esc(f.actor)}</code>`  : "") +
    (f.action ? ` · amal = <code>${esc(f.action)}</code>` : "") +
    (f.search ? ` · qidiruv = <code>${esc(f.search)}</code>` : "");
  const daysRow = Object.keys(AUDIT_DAYS).map((d) => ({
    text: (String(f.days) === d ? "🔘 " : "") + AUDIT_DAYS[d],
    callback_data: `adm:auda:${d}`,
  }));
  const nav = [];
  if (pages > 1) {
    nav.push({ text: page > 1 ? "◀️" : "·", callback_data: page > 1 ? `adm:audpg:${page-1}` : "adm:noop" });
    nav.push({ text: `${page}/${pages}`, callback_data: "adm:noop" });
    nav.push({ text: page < pages ? "▶️" : "·", callback_data: page < pages ? `adm:audpg:${page+1}` : "adm:noop" });
  }
  return {
    text:
      `🧾 <b>Audit jurnal</b> (jami: ${total} · filtrda: ${filtered})\n${filterLine}\n\n${body}\n\n` +
      `Qidiruv: <code>/auditfind MATN</code>\nAdmin: <code>/auditby LOGIN</code>\n` +
      `Amal: <code>/auditact SO'Z</code> · Tozalash: <code>/auditclr</code>`,
    keyboard: [
      daysRow,
      nav.length ? nav : [{ text: "🔄 Yangilash", callback_data: "adm:audit" }],
      [{ text: "📥 Audit ZIP", callback_data: "adm:auditzip" }, { text: "🧹 Filtrni tozalash", callback_data: "adm:audclr" }],
      [{ text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

/* ---- RBAC ekranlari ---- */
const ROLE_KEYS = ["superadmin", "admin", "manager", "viewer"];
const ROLE_LABEL = { superadmin: "👑 Superadmin", admin: "🛡 Admin", manager: "🧑\u200d💼 Manager", viewer: "👁 Viewer" };

function rbacScreen() {
  const admins = roles.listAdmins();
  const body = admins.length
    ? admins.map((a) =>
        `${a.active ? "🟢" : "⚪️"} <b>${esc(a.login)}</b> — ${esc(ROLE_LABEL[a.role] || a.role)}` +
        (a.name ? ` · ${esc(a.name)}` : "") +
        (a.last_login ? `\n   <i>oxirgi kirish: ${dt(a.last_login)}</i>` : "")
      ).join("\n\n")
    : "Adminlar yo'q.";
  const rows = admins.slice(0, 10).map((a) => [
    { text: `⚙️ ${a.login}`, callback_data: `adm:rbu:${a.id}` },
  ]);
  return {
    text:
      `🛡 <b>Rollar va ruxsatlar</b> (RBAC)\n\n${body}\n\n` +
      `Matritsa:\n` +
      Object.entries(roles.ROLES).map(([r, perms]) =>
        `• <b>${esc(ROLE_LABEL[r] || r)}</b>: <code>${esc(perms.join(", "))}</code>`
      ).join("\n"),
    keyboard: [
      ...rows,
      [{ text: "🔄 Yangilash", callback_data: "adm:rbac" }, { text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function rbacUserScreen(uid) {
  const admins = roles.listAdmins();
  const u = admins.find((x) => x.id === Number(uid));
  if (!u) return { text: "Admin topilmadi.", keyboard: [[{ text: "⬅️", callback_data: "adm:rbac" }]] };
  const roleRow = ROLE_KEYS.map((r) => ({
    text: (u.role === r ? "🔘 " : "") + ROLE_LABEL[r].replace(/^\S+\s?/, ""),
    callback_data: `adm:rbr:${u.id}:${r}`,
  }));
  return {
    text:
      `⚙️ <b>${esc(u.login)}</b>\n` +
      `Rol: <b>${esc(ROLE_LABEL[u.role] || u.role)}</b>\n` +
      `Holat: <b>${u.active ? "🟢 Faol" : "⚪️ O'chirilgan"}</b>\n` +
      `Ruxsatlar: <code>${esc(u.perms.join(", "))}</code>` +
      (u.last_login ? `\nOxirgi kirish: <i>${dt(u.last_login)}</i>` : ""),
    keyboard: [
      roleRow.slice(0, 2),
      roleRow.slice(2),
      [{ text: u.active ? "⏸ O'chirish" : "▶️ Yoqish", callback_data: `adm:rbt:${u.id}` }],
      [{ text: "⬅️ RBAC", callback_data: "adm:rbac" }, { text: "🏠 Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function reportScreen() {
  const s = getSettings();
  const enabled = String(s.daily_report_enabled) === "1";
  const hour = Number(s.daily_report_hour ?? 9);
  return {
    text:
      `📊 <b>Kunlik hisobot</b>\n\n` +
      `Holat: <b>${enabled ? "🟢 Yoqilgan" : "⚪️ O'chirilgan"}</b>\n` +
      `Yuborish soati: <b>${String(hour).padStart(2,"0")}:00</b> (server vaqti)\n\n` +
      `Ichida: buyurtmalar statistikasi, xatolar (24s), audit (24s).\n` +
      `Qo'lda yuborish: <code>/report</code>\n` +
      `Sozlash: <code>/reportauto on 9</code> yoki <code>/reportauto off</code>`,
    keyboard: [
      [{ text: enabled ? "⏸ O'chirish" : "▶️ Yoqish", callback_data: `adm:rpt:${enabled ? "off" : "on"}` }],
      [{ text: "📤 Hozir yuborish", callback_data: "adm:rptnow" }],
      [
        { text: "🕘 09:00", callback_data: "adm:rph:9"  },
        { text: "🕛 12:00", callback_data: "adm:rph:12" },
        { text: "🕕 18:00", callback_data: "adm:rph:18" },
        { text: "🕘 21:00", callback_data: "adm:rph:21" },
      ],
      [{ text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

/* -------- Navbat / zaxira / server holati -------- */

function queueScreen() {
  const st = retry.queueStats();
  const { rows } = retry.listJobs({ limit: 8 });
  const body = rows.map((j) => {
    const mark = { pending: "⏳", done: "✅", dead: "💀" }[j.status] || "·";
    const err = j.last_error ? `\n   <code>${esc(String(j.last_error).slice(0, 120))}</code>` : "";
    return `${mark} #${j.id} <code>${esc(j.kind)}</code> — urinish ${j.attempts}/${j.max_attempts}` +
      (j.status === "pending" ? ` · keyingi: ${dt(j.next_at)}` : "") + err;
  }).join("\n\n") || "Navbat bo'sh ✅";
  return {
    text:
      `🔁 <b>Qayta urinish navbati</b>\n\n` +
      `⏳ Kutmoqda: <b>${st.pending}</b> (hozir: ${st.dueNow})\n✅ Bajarildi: <b>${st.done}</b>\n💀 O'lik: <b>${st.dead}</b>\n\n${body}`,
    keyboard: [
      [{ text: "▶️ Hozir urinish", callback_data: "adm:queuerun" }, { text: "🔄 Yangilash", callback_data: "adm:queue" }],
      [{ text: "♻️ O'liklarni qayta", callback_data: "adm:queueretry" }, { text: "🧹 Tozalash", callback_data: "adm:queueclear" }],
      [{ text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function backupsScreen() {
  const items = backup.listBackups().slice(0, 8);
  const body = items.map((b, i) =>
    `${i + 1}. <code>${esc(b.name)}</code>\n   ${kb(b.size)} · ${dt(b.created_at)} · ${esc(b.reason)}`
  ).join("\n") || "Hozircha zaxira yo'q.";
  const rows = items.slice(0, 5).map((b) => [
    { text: `⬇️ ${b.name.slice(5, 24)}`, callback_data: `adm:bget:${tok(b.name)}` },
    { text: "♻️ Tiklash", callback_data: `adm:brest:${tok(b.name)}` },
  ]);
  return {
    text: `💾 <b>Zaxira nusxalari</b>\nPapka: <code>${esc(backup.BACKUP_DIR)}</code>\n\n${body}\n\n` +
          `⚠️ Tiklash 2 bosqichli tasdiqdan o'tadi (kod yozish shart).`,
    keyboard: [
      [{ text: "➕ Hozir zaxira olish", callback_data: "adm:bnew" }],
      ...rows,
      [{ text: "🔄 Yangilash", callback_data: "adm:backups" }, { text: "⬅️ Menyu", callback_data: "adm:menu" }],
    ],
  };
}

function healthScreen() {
  const st = retry.queueStats();
  const dbSize = (() => { try { return kb(fs.statSync(require("./db").DB_FILE).size); } catch { return "—"; } })();
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  return {
    text:
      `🖥 <b>Server holati</b>\n\n` +
      `⏱ Uptime: <b>${Math.floor(process.uptime() / 60)} min</b>\n` +
      `🧠 Xotira: <b>${mem} MB</b>\n` +
      `🗄 Baza: <b>${dbSize}</b>\n` +
      `💾 Zaxiralar: <b>${backup.listBackups().length}</b>\n` +
      `🔁 Navbat: <b>${st.pending}</b> kutmoqda / <b>${st.dead}</b> o'lik\n` +
      `🤖 Rejim: <b>${config.useWebhook ? "webhook" : "polling"}</b>\n` +
      `⚙️ Node: <b>${process.version}</b>`,
    keyboard: [[{ text: "🔄 Yangilash", callback_data: "adm:health" }, { text: "⬅️ Menyu", callback_data: "adm:menu" }]],
  };
}

/* --------------------------- Ro'yxatga olish --------------------------- */

function registerAdmin(bot, { safeSend }) {
  const show = async (chatId, screen, messageId) => {
    const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: screen.keyboard } };
    if (messageId) {
      try {
        return await bot.editMessageText(screen.text, { chat_id: chatId, message_id: messageId, ...opts });
      } catch { return null; }
    }
    return safeSend(chatId, screen.text, opts);
  };

  const guard = (msg) => {
    if (!isAdmin(msg.from.id)) return false;
    return true;
  };

  bot.onText(/^\/admin\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "menu.open");
    await show(msg.chat.id, menuScreen());
  });

  bot.onText(/^\/orders\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "orders.open");
    await show(msg.chat.id, ordersScreen(msg.from.id));
  });

  bot.onText(/^\/find\s+(.+)/, async (msg, m) => {
    if (!guard(msg)) return;
    const f = getFilter(msg.from.id);
    f.search = String(m[1]).slice(0, 60); f.page = 1;
    botAudit(msg.from, "orders.filter.search", null, { search: f.search });
    await show(msg.chat.id, ordersScreen(msg.from.id));
  });

  bot.onText(/^\/clearfilter\b/, async (msg) => {
    if (!guard(msg)) return;
    orderFilters.set(msg.from.id, { status: "all", days: 0, search: "", page: 1 });
    botAudit(msg.from, "orders.filter.clear");
    await show(msg.chat.id, ordersScreen(msg.from.id));
  });

  bot.onText(/^\/(monitoring|logs)\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "monitoring.open");
    await show(msg.chat.id, monScreen());
  });

  bot.onText(/^\/errors\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "logs.errors");
    await show(msg.chat.id, logsScreen(null, "error"));
  });

  bot.onText(/^\/queue\b/, async (msg) => {
    if (!guard(msg)) return;
    await show(msg.chat.id, queueScreen());
  });

  bot.onText(/^\/health\b/, async (msg) => {
    if (!guard(msg)) return;
    await show(msg.chat.id, healthScreen());
  });

  bot.onText(/^\/audit\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "audit.open");
    await show(msg.chat.id, auditScreen());
  });

  bot.onText(/^\/logzip\b/, async (msg) => {
    if (!guard(msg)) return;
    await sendLogsZip(bot, msg.chat.id, msg.from);
  });

  bot.onText(/^\/backup\b/, async (msg) => {
    if (!guard(msg)) return;
    await safeSend(msg.chat.id, "⏳ Zaxira olinmoqda…");
    try {
      const b = await backup.createBackup("manual", `tg:${msg.from.id}`);
      botAudit(msg.from, "backup.create", b.name, { size: b.size });
      await sendBackupFile(bot, msg.chat.id, b.name, `✅ Zaxira tayyor: <code>${esc(b.name)}</code> (${kb(b.size)})`);
    } catch (e) {
      await safeSend(msg.chat.id, `❌ Xato: ${esc(e.message)}`);
    }
  });

  bot.onText(/^\/backups\b/, async (msg) => {
    if (!guard(msg)) return;
    await show(msg.chat.id, backupsScreen());
  });

  /* Restore — endi majburiy 2 bosqichli tasdiq */
  bot.onText(/^\/restore(?:\s+(\S+))?/, async (msg, m) => {
    if (!guard(msg)) return;
    const name = m && m[1];
    if (!name) return show(msg.chat.id, backupsScreen());
    await requestRestoreConfirm(bot, msg.chat.id, msg.from, name);
  });

  /* 2-bosqich: admin CONFIRM <kod> yozadi */
  bot.onText(/^\/confirm\s+(\d{6})\s*$/i, async (msg, m) => {
    if (!guard(msg)) return;
    const state = restoreConfirm.get(msg.from.id);
    if (!state) return safeSend(msg.chat.id, "Kutilayotgan tiklash so'rovi yo'q.");
    if (Date.now() > state.exp) {
      restoreConfirm.delete(msg.from.id);
      return safeSend(msg.chat.id, "⏰ Tasdiqlash vaqti tugagan. Qaytadan boshlang.");
    }
    if (m[1] !== state.code) {
      botAudit(msg.from, "restore.confirm.wrong_code", state.name);
      return safeSend(msg.chat.id, "❌ Kod noto'g'ri.");
    }
    restoreConfirm.delete(msg.from.id);
    botAudit(msg.from, "restore.confirm.ok", state.name);
    await doRestore(bot, msg.chat.id, state.name, msg.from, safeSend);
  });

  /* Admin .db faylni botga tashlasa — zaxira sifatida saqlaymiz */
  bot.on("document", async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    const doc = msg.document;
    if (!doc || !/\.db$/i.test(doc.file_name || "")) return;
    try {
      const buf = await bot.downloadFile(doc.file_id, backup.BACKUP_DIR);
      const saved = backup.importBackup(fs.readFileSync(buf), doc.file_name, `tg:${msg.from.id}`);
      try { fs.unlinkSync(buf); } catch {}
      botAudit(msg.from, "backup.upload", saved.name);
      await safeSend(msg.chat.id,
        `✅ Fayl zaxira sifatida saqlandi: <code>${esc(saved.name)}</code>\n\n` +
        `Tiklash uchun: /restore ${esc(saved.name)} (2 bosqichli tasdiq bo'ladi)`,
        { parse_mode: "HTML" });
    } catch (e) {
      await safeSend(msg.chat.id, `❌ Fayl qabul qilinmadi: ${esc(e.message)}`);
    }
  });

  /* Inline tugmalar */
  bot.on("callback_query", async (cq) => {
    const data = cq.data || "";
    if (!data.startsWith("adm:")) return;
    const chatId = cq.message.chat.id;
    const mid = cq.message.message_id;
    if (!isAdmin(cq.from.id)) {
      return bot.answerCallbackQuery(cq.id, { text: "Ruxsat yo'q", show_alert: true }).catch(() => {});
    }
    const parts = data.split(":");
    const action = parts[1]; const arg = parts.slice(2).join(":");
    try {
      switch (action) {
        case "noop":
          await bot.answerCallbackQuery(cq.id).catch(() => {});
          break;
        case "menu":
          await show(chatId, menuScreen(), mid); break;
        case "mon":
          await show(chatId, monScreen(), mid); break;
        case "errors":
          botAudit(cq.from, "logs.errors");
          await show(chatId, logsScreen(null, "error"), mid); break;
        case "logs":
          await show(chatId, logsScreen(arg === "all" ? null : arg), mid); break;
        case "logsclear": {
          const n = clearLogs();
          botAudit(cq.from, "logs.clear", null, { removed: n });
          await bot.answerCallbackQuery(cq.id, { text: `Tozalandi: ${n} ta` }).catch(() => {});
          await show(chatId, monScreen(), mid); break;
        }
        case "audit":
          await show(chatId, auditScreen(cq.from.id), mid); break;
        case "auditzip":
          await bot.answerCallbackQuery(cq.id, { text: "Tayyorlanmoqda…" }).catch(() => {});
          await sendAuditZip(bot, chatId, cq.from); break;
        case "logzip":
          await bot.answerCallbackQuery(cq.id, { text: "ZIP tayyorlanmoqda…" }).catch(() => {});
          await sendLogsZip(bot, chatId, cq.from); break;

        /* Buyurtmalar */
        case "orders":
          await show(chatId, ordersScreen(cq.from.id), mid); break;
        case "opg": {
          const f = getFilter(cq.from.id);
          f.page = Number(arg) || 1;
          await show(chatId, ordersScreen(cq.from.id), mid); break;
        }
        case "ost": {
          const f = getFilter(cq.from.id);
          f.status = arg || "all"; f.page = 1;
          botAudit(cq.from, "orders.filter.status", null, { status: f.status });
          await show(chatId, ordersScreen(cq.from.id), mid); break;
        }
        case "oda": {
          const f = getFilter(cq.from.id);
          f.days = Number(arg) || 0; f.page = 1;
          botAudit(cq.from, "orders.filter.days", null, { days: f.days });
          await show(chatId, ordersScreen(cq.from.id), mid); break;
        }
        case "oclr":
          orderFilters.set(cq.from.id, { status: "all", days: 0, search: "", page: 1 });
          await show(chatId, ordersScreen(cq.from.id), mid); break;
        case "ocsv": {
          await bot.answerCallbackQuery(cq.id, { text: "CSV tayyorlanmoqda…" }).catch(() => {});
          const buf = ordersCsv(getFilter(cq.from.id));
          botAudit(cq.from, "orders.export.csv", null, { bytes: buf.length });
          const f0 = getFilter(cq.from.id);
          const capt = `📤 Buyurtmalar CSV (joriy filtr)\n` +
            `Status: ${esc(STATUS_LABELS[f0.status] || f0.status)} · Davr: ${esc(DAYS_LABELS[f0.days] || f0.days+"k")}` +
            (f0.search ? ` · Qidiruv: ${esc(f0.search)}` : "");
          await bot.sendDocument(chatId, buf, { caption: capt, parse_mode: "HTML" }, { filename: `orders_${Date.now()}.csv`, contentType: "text/csv" });
          break;
        }

        case "health":
          await show(chatId, healthScreen(), mid); break;

        case "queue":
          await show(chatId, queueScreen(), mid); break;
        case "queuerun": {
          const n = await retry.processDue();
          botAudit(cq.from, "queue.run", null, { done: n });
          await bot.answerCallbackQuery(cq.id, { text: `Bajarildi: ${n} ta job` }).catch(() => {});
          await show(chatId, queueScreen(), mid); break;
        }
        case "queueretry": {
          let n = 0;
          for (const j of retry.listJobs({ status: "dead", limit: 50 }).rows) if (retry.requeue(j.id)) n++;
          botAudit(cq.from, "queue.requeue", null, { count: n });
          await bot.answerCallbackQuery(cq.id, { text: `Qayta navbatga: ${n} ta` }).catch(() => {});
          await show(chatId, queueScreen(), mid); break;
        }
        case "queueclear": {
          const n = retry.clearFinished();
          botAudit(cq.from, "queue.clear", null, { removed: n });
          await bot.answerCallbackQuery(cq.id, { text: `O'chirildi: ${n} ta` }).catch(() => {});
          await show(chatId, queueScreen(), mid); break;
        }

        case "backups":
          await show(chatId, backupsScreen(), mid); break;
        case "bnew": {
          await bot.answerCallbackQuery(cq.id, { text: "Zaxira olinmoqda…" }).catch(() => {});
          const b = await backup.createBackup("manual", `tg:${cq.from.id}`);
          botAudit(cq.from, "backup.create", b.name, { size: b.size });
          await show(chatId, backupsScreen(), mid);
          await sendBackupFile(bot, chatId, b.name, `✅ Yangi zaxira: <code>${esc(b.name)}</code> (${kb(b.size)})`);
          break;
        }
        case "bget": {
          const name = tokens.get(arg);
          await bot.answerCallbackQuery(cq.id, { text: name ? "Yuborilmoqda…" : "Muddati tugagan" }).catch(() => {});
          if (name) { botAudit(cq.from, "backup.download", name); await sendBackupFile(bot, chatId, name, `💾 <code>${esc(name)}</code>`); }
          break;
        }

        /* ---- Restore: 2 bosqichli tasdiq ---- */
        case "brest": {
          const name = tokens.get(arg);
          await bot.answerCallbackQuery(cq.id).catch(() => {});
          if (!name) return safeSend(chatId, "Muddati tugagan, qaytadan oching.");
          await requestRestoreConfirm(bot, chatId, cq.from, name);
          break;
        }
        case "brestok": {
          /* 1-bosqich: "Ha, tiklansin" bosildi — endi kod so'raymiz */
          const name = tokens.get(arg);
          await bot.answerCallbackQuery(cq.id).catch(() => {});
          if (!name) return safeSend(chatId, "Muddati tugagan, qaytadan oching.");
          const code = makeCode();
          restoreConfirm.set(cq.from.id, { name, code, exp: Date.now() + 5*60_000 });
          botAudit(cq.from, "restore.confirm.request", name);
          await bot.sendMessage(chatId,
            `🔐 <b>2-bosqichli tasdiq</b>\n\n` +
            `Tiklash uchun quyidagi 6 xonali kodni qayta yozing:\n\n` +
            `<code>${code}</code>\n\n` +
            `Buyruq: <code>/confirm ${code}</code>\n` +
            `Muddat: 5 daqiqa.`,
            { parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "adm:brestcancel" }]] } });
          break;
        }
        case "brestcancel":
          restoreConfirm.delete(cq.from.id);
          botAudit(cq.from, "restore.confirm.cancel");
          await bot.answerCallbackQuery(cq.id, { text: "Bekor qilindi" }).catch(() => {});
          await bot.editMessageText("❌ Tiklash bekor qilindi.", { chat_id: chatId, message_id: mid }).catch(() => {});
          break;

        /* Audit filtrlari */
        case "audpg": {
          const af = getAuditFilter(cq.from.id); af.page = Number(arg) || 1;
          await show(chatId, auditScreen(cq.from.id), mid); break;
        }
        case "auda": {
          const af = getAuditFilter(cq.from.id); af.days = Number(arg) || 0; af.page = 1;
          botAudit(cq.from, "audit.filter.days", null, { days: af.days });
          await show(chatId, auditScreen(cq.from.id), mid); break;
        }
        case "audclr":
          auditFilters.set(cq.from.id, { actor: "", action: "", days: 0, search: "", page: 1 });
          botAudit(cq.from, "audit.filter.clear");
          await show(chatId, auditScreen(cq.from.id), mid); break;

        /* RBAC */
        case "rbac":
          await show(chatId, rbacScreen(), mid); break;
        case "rbu":
          await show(chatId, rbacUserScreen(arg), mid); break;
        case "rbr": {
          const [uid, role] = arg.split(":");
          try {
            const target = roles.listAdmins().find((x) => x.id === Number(uid));
            roles.updateAdmin(Number(uid), { role }, { uid: 0, login: `tg:${cq.from.id}`, role: "superadmin" });
            botAudit(cq.from, "rbac.role.change", target?.login, { role });
            await bot.answerCallbackQuery(cq.id, { text: `Rol: ${role}` }).catch(() => {});
          } catch (e) {
            await bot.answerCallbackQuery(cq.id, { text: e.message, show_alert: true }).catch(() => {});
          }
          await show(chatId, rbacUserScreen(uid), mid); break;
        }
        case "rbt": {
          try {
            const target = roles.listAdmins().find((x) => x.id === Number(arg));
            if (!target) throw new Error("Topilmadi");
            roles.updateAdmin(target.id, { active: !target.active }, { uid: 0, login: `tg:${cq.from.id}`, role: "superadmin" });
            botAudit(cq.from, "rbac.active.toggle", target.login, { active: !target.active });
            await bot.answerCallbackQuery(cq.id, { text: !target.active ? "Yoqildi" : "O'chirildi" }).catch(() => {});
          } catch (e) {
            await bot.answerCallbackQuery(cq.id, { text: e.message, show_alert: true }).catch(() => {});
          }
          await show(chatId, rbacUserScreen(arg), mid); break;
        }

        /* Kunlik hisobot */
        case "rpt":
          if (arg === "on" || arg === "off") {
            saveSettings({ daily_report_enabled: arg === "on" ? "1" : "0" });
            botAudit(cq.from, "report.daily.toggle", null, { enabled: arg === "on" });
          }
          await show(chatId, reportScreen(), mid); break;
        case "rph": {
          const h = Math.max(0, Math.min(23, Number(arg) || 9));
          saveSettings({ daily_report_hour: String(h) });
          botAudit(cq.from, "report.daily.hour", null, { hour: h });
          await bot.answerCallbackQuery(cq.id, { text: `Soat: ${h}:00` }).catch(() => {});
          await show(chatId, reportScreen(), mid); break;
        }
        case "rptnow": {
          await bot.answerCallbackQuery(cq.id, { text: "Yuborilmoqda…" }).catch(() => {});
          try {
            const r = await scheduler.sendDailyReport({ manual: true, actor: { actorType: "bot", id: cq.from.id, name: cq.from.username || cq.from.first_name } });
            await safeSend(chatId, `✅ Hisobot yuborildi: ${r.ok}/${r.ok+r.fail} admin`);
          } catch (e) {
            await safeSend(chatId, `❌ ${esc(e.message)}`);
          }
          break;
        }

        default:
          await bot.answerCallbackQuery(cq.id).catch(() => {});
      }
    } catch (e) {
      logger.error("bot", `Admin tugmasi xatosi: ${action}`, { error: e.message }, cq.from.id);
      await bot.answerCallbackQuery(cq.id, { text: `Xato: ${e.message}`.slice(0, 190), show_alert: true }).catch(() => {});
    }
  });

  bot.onText(/^\/auditfind\s+(.+)/, async (msg, m) => {
    if (!guard(msg)) return;
    const af = getAuditFilter(msg.from.id);
    af.search = String(m[1]).slice(0, 60); af.page = 1;
    botAudit(msg.from, "audit.filter.search", null, { search: af.search });
    await show(msg.chat.id, auditScreen(msg.from.id));
  });
  bot.onText(/^\/auditby\s+(\S+)/, async (msg, m) => {
    if (!guard(msg)) return;
    const af = getAuditFilter(msg.from.id); af.actor = String(m[1]).slice(0, 60); af.page = 1;
    botAudit(msg.from, "audit.filter.actor", null, { actor: af.actor });
    await show(msg.chat.id, auditScreen(msg.from.id));
  });
  bot.onText(/^\/auditact\s+(\S+)/, async (msg, m) => {
    if (!guard(msg)) return;
    const af = getAuditFilter(msg.from.id); af.action = String(m[1]).slice(0, 60); af.page = 1;
    botAudit(msg.from, "audit.filter.action", null, { action: af.action });
    await show(msg.chat.id, auditScreen(msg.from.id));
  });
  bot.onText(/^\/auditclr\b/, async (msg) => {
    if (!guard(msg)) return;
    auditFilters.set(msg.from.id, { actor: "", action: "", days: 0, search: "", page: 1 });
    botAudit(msg.from, "audit.filter.clear");
    await show(msg.chat.id, auditScreen(msg.from.id));
  });

  bot.onText(/^\/rbac\b/, async (msg) => {
    if (!guard(msg)) return;
    botAudit(msg.from, "rbac.open");
    await show(msg.chat.id, rbacScreen());
  });

  bot.onText(/^\/report\b/, async (msg) => {
    if (!guard(msg)) return;
    try {
      const r = await scheduler.sendDailyReport({ manual: true, actor: { actorType: "bot", id: msg.from.id, name: msg.from.username || msg.from.first_name } });
      await safeSend(msg.chat.id, `✅ Kunlik hisobot yuborildi: ${r.ok}/${r.ok+r.fail} admin`);
    } catch (e) {
      await safeSend(msg.chat.id, `❌ Xato: ${esc(e.message)}`);
    }
  });
  bot.onText(/^\/reportauto\s+(on|off)(?:\s+(\d{1,2}))?/i, async (msg, m) => {
    if (!guard(msg)) return;
    const on = m[1].toLowerCase() === "on";
    const patch = { daily_report_enabled: on ? "1" : "0" };
    if (on && m[2]) patch.daily_report_hour = String(Math.max(0, Math.min(23, Number(m[2]))));
    saveSettings(patch);
    botAudit(msg.from, "report.daily.config", null, patch);
    await show(msg.chat.id, reportScreen());
  });

  /* Xatolarni adminlarga avtomatik xabar qilish (daqiqasiga ko'pi bilan 1 ta) */
  let lastAlert = 0;
  onError((entry) => {
    if (!config.adminIds.length) return;
    const now = Date.now();
    if (now - lastAlert < 60_000) return;
    lastAlert = now;
    const text =
      `🚨 <b>Xatolik</b> · <code>${esc(entry.source)}</code>\n${esc(entry.message)}\n\n` +
      `Batafsil: /errors`;
    for (const id of config.adminIds) {
      bot.sendMessage(id, text, { parse_mode: "HTML" }).catch(() => {});
    }
  });

  logger.info("bot", `Bot admin paneli yoqildi (${config.adminIds.length} ta admin ID)`);
}

/* --------------------------- Yordamchi funksiyalar --------------------------- */

async function requestRestoreConfirm(bot, chatId, from, name) {
  botAudit(from, "restore.step1", name);
  await bot.sendMessage(chatId,
    `⚠️ <b>Zaxiradan tiklash</b>\n\n` +
    `Fayl: <code>${esc(name)}</code>\n\n` +
    `Joriy baza to'liq almashtiriladi (avval xavfsizlik nusxasi olinadi).\n` +
    `Davom etish uchun <b>2 bosqichli tasdiq</b> talab qilinadi.`,
    { parse_mode: "HTML",
      reply_markup: { inline_keyboard: [
        [{ text: "🔐 Tasdiqni boshlash", callback_data: `adm:brestok:${tok(name)}` }],
        [{ text: "❌ Bekor", callback_data: "adm:backups" }],
      ] } });
}

async function sendBackupFile(bot, chatId, name, caption) {
  const file = backup.backupPath(name);
  try {
    await bot.sendDocument(chatId, file, { caption, parse_mode: "HTML" }, { filename: name, contentType: "application/x-sqlite3" });
  } catch (e) {
    await bot.sendMessage(chatId, `${caption}\n\n⚠️ Faylni yuborib bo'lmadi: ${esc(e.message)}`, { parse_mode: "HTML" }).catch(() => {});
  }
}

function toCsvRows(header, rows, mapper) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return header.join(",") + "\n" + rows.map((r) => mapper(r).map(esc).join(",")).join("\n");
}

async function sendLogsZip(bot, chatId, from) {
  const all = listLogs({ limit: 10000 }).rows;
  const errors = listLogs({ level: "error", limit: 5000 }).rows;
  const audit = listAudit({ limit: 10000 }).rows;
  const stats = logStats();

  const files = [
    { name: "README.txt",
      data: `Telegram Shop — logs export\nGenerated: ${new Date().toISOString()}\n` +
            `By: ${from.username || from.first_name || from.id}\n\n` +
            `Files:\n - logs_all.csv (${all.length})\n - logs_errors.csv (${errors.length})\n - audit.csv (${audit.length})\n - stats.json\n` },
    { name: "logs_all.csv",
      data: toCsvRows(["id","ts","level","source","message","meta","ref_id"], all,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.level, r.source, r.message, r.meta, r.ref_id]) },
    { name: "logs_errors.csv",
      data: toCsvRows(["id","ts","source","message","meta","ref_id"], errors,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.source, r.message, r.meta, r.ref_id]) },
    { name: "audit.csv",
      data: toCsvRows(["id","ts","actor_type","actor_id","actor_name","action","target","ip","meta"], audit,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.actor_type, r.actor_id, r.actor_name, r.action, r.target, r.ip, r.meta]) },
    { name: "stats.json", data: JSON.stringify(stats, null, 2) },
  ];
  const zip = buildZip(files);
  botAudit(from, "logs.export.zip", null, { bytes: zip.length, entries: files.length });
  const fname = `logs_${new Date().toISOString().replace(/[:.]/g, "-").slice(0,19)}.zip`;
  try {
    await bot.sendDocument(chatId, zip, {
      caption: `📥 Loglar arxivi (${(zip.length/1024).toFixed(1)} KB)\nIchida: loglar, xatolar, audit.`,
    }, { filename: fname, contentType: "application/zip" });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ ZIP yuborib bo'lmadi: ${esc(e.message)}`).catch(() => {});
  }
}

async function sendAuditZip(bot, chatId, from) {
  const audit = listAudit({ limit: 20000 }).rows;
  const csv = toCsvRows(["id","ts","actor_type","actor_id","actor_name","action","target","ip","meta"], audit,
    (r) => [r.id, new Date(r.ts*1000).toISOString(), r.actor_type, r.actor_id, r.actor_name, r.action, r.target, r.ip, r.meta]);
  const zip = buildZip([{ name: "audit.csv", data: csv }]);
  botAudit(from, "audit.export.zip", null, { bytes: zip.length, rows: audit.length });
  await bot.sendDocument(chatId, zip, { caption: `🧾 Audit ${audit.length} ta yozuv` },
    { filename: `audit_${Date.now()}.zip`, contentType: "application/zip" });
}

async function doRestore(bot, chatId, name, from, safeSend) {
  try {
    await safeSend(chatId, "⏳ Tiklanmoqda…");
    const r = await backup.restoreBackup(name, `tg:${from.id}`);
    botAudit(from, "restore.execute", name, { safety: r.safety });
    await bot.sendMessage(chatId,
      `✅ Tiklandi: <code>${esc(r.restored)}</code>\n🛡 Xavfsizlik nusxasi: <code>${esc(r.safety)}</code>\n\n♻️ Server qayta ishga tushmoqda…`,
      { parse_mode: "HTML" });
  } catch (e) {
    botAudit(from, "restore.execute.fail", name, { error: e.message });
    await bot.sendMessage(chatId, `❌ Tiklash xatosi: ${esc(e.message)}`, { parse_mode: "HTML" }).catch(() => {});
  }
}

module.exports = { registerAdmin, isAdmin };
