"use strict";
const TelegramBot = require("node-telegram-bot-api");
const { config } = require("./config");
const { q, getSettings } = require("./db");
const { logger } = require("./logger");
const { enqueue, retryAsync } = require("./retry");

const ADMIN_IDS = config.adminIds;

/* ----------------------------- i18n ----------------------------- */
const T = {
  uz: {
    choose_lang: "🌐 Tilni tanlang / Выберите язык / Choose language",
    welcome: "Assalomu alaykum, {name}! 🛍\n\n{shop} do'koniga xush kelibsiz.\nQuyidagi tugma orqali do'konni oching.",
    open_shop: "🛍 Do'konni ochish",
    my_orders: "📦 Buyurtmalarim",
    contact: "📞 Aloqa",
    lang_btn: "🌐 Til",
    help: "ℹ️ Yordam: /start — do'kon, /orders — buyurtmalar, /lang — til",
    changed_lang: "✅ Til o'zgartirildi",
    need_https: "⚠️ Do'kon hozircha sozlanmoqda. Iltimos keyinroq urinib ko'ring.",
    no_orders: "📦 Sizda hali buyurtma yo'q.",
    contact_txt: "📞 {phone}\n{username}",
    order_line: "<b>Buyurtma #{id}</b> — {status}\n{list}\n\n💰 Jami: <b>{total}</b>",
    status_changed: "🔔 <b>Buyurtma #{id}</b> holati: <b>{status}</b>{comment}",
    blocked: "⛔️ Sizning hisobingiz bloklangan.",
  },
  ru: {
    choose_lang: "🌐 Выберите язык",
    welcome: "Здравствуйте, {name}! 🛍\n\nДобро пожаловать в {shop}.\nОткройте магазин кнопкой ниже.",
    open_shop: "🛍 Открыть магазин",
    my_orders: "📦 Мои заказы",
    contact: "📞 Контакты",
    lang_btn: "🌐 Язык",
    help: "ℹ️ /start — магазин, /orders — заказы, /lang — язык",
    changed_lang: "✅ Язык изменён",
    need_https: "⚠️ Магазин настраивается. Попробуйте позже.",
    no_orders: "📦 Заказов пока нет.",
    contact_txt: "📞 {phone}\n{username}",
    order_line: "<b>Заказ #{id}</b> — {status}\n{list}\n\n💰 Итого: <b>{total}</b>",
    status_changed: "🔔 <b>Заказ #{id}</b> статус: <b>{status}</b>{comment}",
    blocked: "⛔️ Ваш аккаунт заблокирован.",
  },
  en: {
    choose_lang: "🌐 Choose language",
    welcome: "Hello, {name}! 🛍\n\nWelcome to {shop}.\nOpen the shop with the button below.",
    open_shop: "🛍 Open shop",
    my_orders: "📦 My orders",
    contact: "📞 Contact",
    lang_btn: "🌐 Language",
    help: "ℹ️ /start — shop, /orders — orders, /lang — language",
    changed_lang: "✅ Language changed",
    need_https: "⚠️ The shop is being configured. Please try later.",
    no_orders: "📦 No orders yet.",
    contact_txt: "📞 {phone}\n{username}",
    order_line: "<b>Order #{id}</b> — {status}\n{list}\n\n💰 Total: <b>{total}</b>",
    status_changed: "🔔 <b>Order #{id}</b> status: <b>{status}</b>{comment}",
    blocked: "⛔️ Your account is blocked.",
  },
};
T.kk = { ...T.ru, open_shop: "🛍 Дүкенді ашу", my_orders: "📦 Тапсырыстар", contact: "📞 Байланыс", lang_btn: "🌐 Тіл", choose_lang: "🌐 Тілді таңдаңыз", changed_lang: "✅ Тіл өзгертілді", no_orders: "📦 Тапсырыс жоқ." };
T.tr = { ...T.en, open_shop: "🛍 Mağazayı aç", my_orders: "📦 Siparişlerim", contact: "📞 İletişim", lang_btn: "🌐 Dil", choose_lang: "🌐 Dil seçin", changed_lang: "✅ Dil değişti", no_orders: "📦 Sipariş yok." };
T.tg = { ...T.ru, open_shop: "🛍 Мағозаро кушо", my_orders: "📦 Фармоишҳо", contact: "📞 Тамос", lang_btn: "🌐 Забон", choose_lang: "🌐 Забонро интихоб кунед", changed_lang: "✅ Забон иваз шуд", no_orders: "📦 Фармоиш нест." };

const STATUS_LABEL = {
  uz: { new: "🆕 Yangi", paid: "💳 To'landi", packing: "📦 Qadoqlanmoqda", shipping: "🚚 Yo'lda", delivered: "✅ Yetkazildi", cancelled: "❌ Bekor qilindi" },
  ru: { new: "🆕 Новый", paid: "💳 Оплачен", packing: "📦 Упаковка", shipping: "🚚 В пути", delivered: "✅ Доставлен", cancelled: "❌ Отменён" },
  en: { new: "🆕 New", paid: "💳 Paid", packing: "📦 Packing", shipping: "🚚 Shipping", delivered: "✅ Delivered", cancelled: "❌ Cancelled" },
};
STATUS_LABEL.kk = STATUS_LABEL.ru;
STATUS_LABEL.tg = STATUS_LABEL.ru;
STATUS_LABEL.tr = STATUS_LABEL.en;

const LANG_NAMES = { uz: "🇺🇿 O'zbek", ru: "🇷🇺 Русский", en: "🇬🇧 English", kk: "🇰🇿 Қазақша", tr: "🇹🇷 Türkçe", tg: "🇹🇯 Тоҷикӣ" };

const tr = (lang, key, vars = {}) => {
  let s = (T[lang] || T.uz)[key] ?? (T.uz[key] || key);
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v ?? ""));
  return s;
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => Number(n || 0).toLocaleString("ru-RU");

let bot = null;
const getBot = () => bot;

/* --------------------------- Keyboards --------------------------- */
function langKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: LANG_NAMES.uz, callback_data: "lang:uz" }, { text: LANG_NAMES.ru, callback_data: "lang:ru" }],
        [{ text: LANG_NAMES.en, callback_data: "lang:en" }, { text: LANG_NAMES.kk, callback_data: "lang:kk" }],
        [{ text: LANG_NAMES.tr, callback_data: "lang:tr" }, { text: LANG_NAMES.tg, callback_data: "lang:tg" }],
      ],
    },
  };
}

function mainKeyboard(lang) {
  const rows = [];
  if (config.publicUrl.startsWith("https://")) {
    rows.push([{ text: tr(lang, "open_shop"), web_app: { url: `${config.publicUrl}/?lang=${lang}` } }]);
  }
  rows.push([{ text: tr(lang, "my_orders") }, { text: tr(lang, "contact") }]);
  rows.push([{ text: tr(lang, "lang_btn") }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

async function sendMain(chatId, lang, firstName) {
  const s = getSettings();
  if (!config.publicUrl.startsWith("https://")) {
    await safeSend(chatId, tr(lang, "need_https"));
  }
  await safeSend(chatId, tr(lang, "welcome", { name: esc(firstName || ""), shop: esc(s.shop_name) }), {
    parse_mode: "HTML",
    ...mainKeyboard(lang),
  });
}

/**
 * Bitta urinish. Xatoda exception tashlaydi — retry mexanizmi shuni ushlaydi.
 * 403 (bloklangan) va 400 (chat topilmadi) — qayta urinishga arzimaydi.
 */
async function sendOnce(chatId, text, opts = {}) {
  if (!bot) throw new Error("Bot ishga tushmagan (BOT_TOKEN yo'q)");
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    const code = e?.response?.body?.error_code;
    const retryAfter = e?.response?.body?.parameters?.retry_after;
    if (code === 429 && retryAfter) {
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      return bot.sendMessage(chatId, text, opts);
    }
    if (code === 403) {
      q.setBlocked.run(1, Number(chatId));
      logger.warn("bot", `Foydalanuvchi botni bloklagan: ${chatId}`, null, chatId);
      const err = new Error("Foydalanuvchi botni bloklagan");
      err.permanent = true;
      throw err;
    }
    if (code === 400) {
      const err = new Error(e?.response?.body?.description || e.message);
      err.permanent = true;
      throw err;
    }
    throw e;
  }
}

/**
 * Xavfsiz yuborish: darhol 3 marta backoff bilan urinadi,
 * baribir bo'lmasa doimiy navbatga (retry_queue) qo'yadi.
 */
async function safeSend(chatId, text, opts = {}) {
  try {
    return await retryAsync(() => sendOnce(chatId, text, opts), {
      attempts: 3,
      source: "bot",
      label: `sendMessage → ${chatId}`,
      shouldRetry: (e) => !e?.permanent,
    });
  } catch (e) {
    if (e?.permanent) return null;
    logger.error("bot", `Xabar yuborilmadi: ${chatId}`, { error: e.message }, chatId);
    enqueue("tg_send", { chatId: String(chatId), text, opts }, { refId: String(chatId) });
    return null;
  }
}

function userLang(tgId) {
  return q.getUser.get(tgId)?.lang || "uz";
}

/* ----------------------------- Start ----------------------------- */
function startBot() {
  if (!config.botToken) {
    console.error("❌ BOT_TOKEN yo'q — bot ishga tushmadi.");
    return null;
  }

  bot = new TelegramBot(config.botToken, config.useWebhook ? {} : { polling: { interval: 800, autoStart: true } });
  bot.on("polling_error", (e) => console.error("polling:", e.message));
  bot.on("webhook_error", (e) => console.error("webhook:", e.message));

  if (config.useWebhook) {
    const url = `${config.publicUrl}${config.webhookPath}`;
    bot
      .setWebHook(url, { allowed_updates: ["message", "callback_query"] })
      .then(() => console.log("🤖 Bot ready (webhook):", url))
      .catch((e) => console.error("setWebHook:", e.message));
  } else {
    console.log("🤖 Bot ready (polling)");
  }

  bot
    .setMyCommands([
      { command: "start", description: "🛍 Do'kon / Магазин / Shop" },
      { command: "orders", description: "📦 Buyurtmalarim" },
      { command: "lang", description: "🌐 Til / Язык / Language" },
      { command: "help", description: "ℹ️ Yordam" },
    ])
    .catch(() => {});

  bot.onText(/^\/start/, async (msg) => {
    const f = msg.from;
    q.upsertUser.run(f.id, f.username || null, f.first_name || null, f.last_name || null);
    const row = q.getUser.get(f.id);
    if (row?.blocked) return safeSend(msg.chat.id, tr(row.lang || "uz", "blocked"));
    if (!row?.lang || !row.last_seen) {
      await safeSend(msg.chat.id, tr("uz", "choose_lang"), langKeyboard());
    } else {
      await sendMain(msg.chat.id, row.lang, f.first_name);
    }
    q.markSeen.run(f.id);
  });

  bot.onText(/^\/lang/, (msg) => safeSend(msg.chat.id, tr(userLang(msg.from.id), "choose_lang"), langKeyboard()));
  bot.onText(/^\/help/, (msg) => safeSend(msg.chat.id, tr(userLang(msg.from.id), "help")));
  bot.onText(/^\/orders/, (msg) => sendOrders(msg.chat.id, msg.from.id));

  // Botning ichki admin paneli (monitoring, zaxira, navbat, buyurtmalar)
  try {
    require("./bot_admin").registerAdmin(bot, { safeSend });
    for (const id of ADMIN_IDS) {
      bot
        .setMyCommands(
          [
            { command: "start", description: "🛍 Do'kon" },
            { command: "admin", description: "👨‍💼 Admin panel" },
            { command: "monitoring", description: "🩺 Monitoring" },
            { command: "errors", description: "❌ Oxirgi xatolar" },
            { command: "queue", description: "🔁 Qayta urinish navbati" },
            { command: "backup", description: "💾 Zaxira olish" },
            { command: "backups", description: "🗂 Zaxiralar ro'yxati" },
            { command: "restore", description: "♻️ Zaxiradan tiklash" },
            { command: "health", description: "🖥 Server holati" },
            { command: "orders", description: "📦 Mening buyurtmalarim" },
          ],
          { scope: { type: "chat", chat_id: id } }
        )
        .catch(() => {});
    }
  } catch (e) {
    logger.error("bot", `Admin panelni yuklab bo'lmadi: ${e.message}`);
  }

  bot.on("callback_query", async (cq) => {
    try {
      if (cq.data?.startsWith("lang:")) {
        const lang = cq.data.split(":")[1];
        if (!LANG_NAMES[lang]) return;
        q.upsertUser.run(cq.from.id, cq.from.username || null, cq.from.first_name || null, cq.from.last_name || null);
        q.setLang.run(lang, cq.from.id);
        await bot.answerCallbackQuery(cq.id, { text: tr(lang, "changed_lang") }).catch(() => {});
        await bot
          .editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: cq.message.chat.id, message_id: cq.message.message_id })
          .catch(() => {});
        await sendMain(cq.message.chat.id, lang, cq.from.first_name);
      }
    } catch (e) {
      console.error("callback:", e.message);
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const lang = userLang(msg.from.id);
    const s = getSettings();
    if (msg.text === tr(lang, "my_orders")) return sendOrders(msg.chat.id, msg.from.id);
    if (msg.text === tr(lang, "contact")) {
      const username = s.support_username ? `💬 @${String(s.support_username).replace(/^@/, "")}` : "";
      return safeSend(msg.chat.id, tr(lang, "contact_txt", { phone: esc(s.support_phone), username: esc(username) }));
    }
    if (msg.text === tr(lang, "lang_btn")) return safeSend(msg.chat.id, tr(lang, "choose_lang"), langKeyboard());
  });

  return bot;
}

async function sendOrders(chatId, userId) {
  const lang = userLang(userId);
  const orders = q.userOrders.all(userId);
  if (!orders.length) return safeSend(chatId, tr(lang, "no_orders"));
  for (const o of orders.slice(0, 10)) {
    let items = [];
    try {
      items = JSON.parse(o.items_json);
    } catch {}
    const list = items.map((i) => `• ${esc(i.name)} × ${i.qty}`).join("\n");
    await safeSend(
      chatId,
      tr(lang, "order_line", {
        id: o.id,
        status: (STATUS_LABEL[lang] || STATUS_LABEL.uz)[o.status] || o.status,
        list,
        total: `${money(o.total)} ${esc(o.currency || getSettings().currency)}`,
      }),
      { parse_mode: "HTML" }
    );
  }
}

/* --------------------------- Notifications --------------------------- */
function notifyNewOrder(order) {
  if (!bot || !order) return;
  const s = getSettings();
  const targets = new Set(ADMIN_IDS.map(String));
  if (config.ordersChatId) targets.add(String(config.ordersChatId));

  let items = [];
  try {
    items = JSON.parse(order.items_json);
  } catch {}
  const list = items
    .map((i) => `• ${esc(i.name)} (${esc(i.size || "-")}/${esc(i.color || "-")}) × ${i.qty} = ${money(i.price * i.qty)}`)
    .join("\n");
  const cur = esc(order.currency || s.currency);

  const text =
    `🆕 <b>Yangi buyurtma #${order.id}</b>\n\n` +
    `👤 ${esc(order.name)}\n📞 ${esc(order.phone)}\n📍 ${esc(order.city || "")} ${esc(order.address)}\n💳 ${esc(order.payment)}\n\n` +
    `${list}\n\n` +
    `Mahsulotlar: ${money(order.subtotal)} ${cur}\n` +
    `Yetkazish: ${money(order.shipping)} ${cur}\n` +
    `Chegirma: ${money(order.discount)} ${cur}\n` +
    `<b>Jami: ${money(order.total)} ${cur}</b>`;

  for (const chatId of targets) {
    safeSend(chatId, text, { parse_mode: "HTML" }).catch((e) =>
      logger.error("order", `Admin bildirishnomasi xato (#${order.id})`, { error: e.message, chatId }, order.id)
    );
  }
  logger.info("order", `Yangi buyurtma bildirishnomasi yuborildi #${order.id}`, { targets: [...targets] }, order.id);
}

async function notifyOrderStatus(order, comment) {
  if (!bot || !order) return;
  const lang = userLang(order.user_id);
  const label = (STATUS_LABEL[lang] || STATUS_LABEL.uz)[order.status] || order.status;
  await safeSend(
    order.user_id,
    tr(lang, "status_changed", { id: order.id, status: label, comment: comment ? `\n\n💬 ${esc(comment)}` : "" }),
    { parse_mode: "HTML" }
  );
}

async function broadcast(text) {
  if (!bot) return { sent: 0, total: 0 };
  const ids = q.allUserIds.all().map((r) => r.tg_id);
  let sent = 0;
  for (const chatId of ids) {
    const ok = await safeSend(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 45)); // ~22 msg/s — Telegram limiti ichida
  }
  return { sent, total: ids.length, failed: ids.length - sent };
}

module.exports = { startBot, getBot, notifyNewOrder, notifyOrderStatus, broadcast, safeSend, sendOnce };
