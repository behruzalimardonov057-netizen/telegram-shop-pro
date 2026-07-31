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
    choose_lang: "🌐 <b>Tilni tanlang</b> / Выберите язык / Choose language",
    welcome: "Assalomu alaykum, <b>{name}</b>! 🎉\n\n<b>{shop}</b>ga xush kelibsiz — <i>ishonchli va tez xarid</i> uchun eng qulay platforma.\n\n🛍 Katalogni ko'rish uchun pastdagi tugmani bosing.",
    open_shop: "🛍 Do'konni ochish",
    my_orders: "📦 Buyurtmalarim",
    contact: "📞 Aloqa",
    lang_btn: "🌐 Til",
    help: "ℹ️ /start — do'kon · /orders — buyurtmalar · /lang — til",
    changed_lang: "✅ Til o'zgartirildi",
    need_https: "⚠️ Do'kon hozircha sozlanmoqda. Iltimos keyinroq urinib ko'ring.",
    no_orders: "📦 Sizda hali buyurtma yo'q.",
    contact_txt: "📞 <b>Yordam markazi</b>\n\n{phone}\n{username}\n\n<i>Har kuni 09:00 — 22:00</i>",
    order_line: "<b>Buyurtma #{id}</b> — {status}\n{list}\n\n💰 Jami: <b>{total}</b>",
    status_changed: "🔔 <b>Buyurtma #{id}</b> holati: <b>{status}</b>{comment}",
    blocked: "⛔️ Sizning hisobingiz bloklangan.",
    ask_phone: "📱 <b>Ro'yxatdan o'tish</b>\n\nDo'konga kirish uchun telefon raqamingizni yuboring — buyurtmani tez rasmiylashtirish uchun kerak.\n\n👇 Pastdagi <b>“📱 Raqamni yuborish”</b> tugmasini bosing.",
    share_phone: "📱 Raqamni yuborish",
    phone_saved: "✅ Raqam saqlandi — rahmat!",
    sub_required: "📢 <b>Do'konga kirish uchun rasmiy kanalimizga obuna bo'ling:</b>\n\n👉 {channel}\n\nObuna bo'lgach <b>“✅ Obuna bo'ldim”</b> tugmasini bosing.",
    open_channel: "📢 Kanalga o'tish",
    check_sub: "✅ Obuna bo'ldim",
    sub_ok: "🎉 Rahmat! Endi do'kondan foydalanishingiz mumkin.",
    sub_fail: "❌ Siz hali obuna bo'lmadingiz. Iltimos, kanalga qo'shiling va qayta urinib ko'ring.",
  },
  ru: {
    choose_lang: "🌐 <b>Выберите язык</b>",
    welcome: "Здравствуйте, <b>{name}</b>! 🎉\n\nДобро пожаловать в <b>{shop}</b> — <i>надёжный магазин</i> с быстрой доставкой.\n\n🛍 Нажмите кнопку ниже, чтобы открыть каталог.",
    open_shop: "🛍 Открыть магазин",
    my_orders: "📦 Мои заказы",
    contact: "📞 Контакты",
    lang_btn: "🌐 Язык",
    help: "ℹ️ /start — магазин · /orders — заказы · /lang — язык",
    changed_lang: "✅ Язык изменён",
    need_https: "⚠️ Магазин настраивается. Попробуйте позже.",
    no_orders: "📦 Заказов пока нет.",
    contact_txt: "📞 <b>Служба поддержки</b>\n\n{phone}\n{username}\n\n<i>Ежедневно 09:00 — 22:00</i>",
    order_line: "<b>Заказ #{id}</b> — {status}\n{list}\n\n💰 Итого: <b>{total}</b>",
    status_changed: "🔔 <b>Заказ #{id}</b> статус: <b>{status}</b>{comment}",
    blocked: "⛔️ Ваш аккаунт заблокирован.",
    ask_phone: "📱 <b>Регистрация</b>\n\nОтправьте свой номер телефона, чтобы войти в магазин.\n\n👇 Нажмите кнопку <b>“📱 Отправить номер”</b>.",
    share_phone: "📱 Отправить номер",
    phone_saved: "✅ Номер сохранён — спасибо!",
    sub_required: "📢 <b>Подпишитесь на наш канал, чтобы войти в магазин:</b>\n\n👉 {channel}\n\nПосле подписки нажмите <b>“✅ Я подписался”</b>.",
    open_channel: "📢 Перейти в канал",
    check_sub: "✅ Я подписался",
    sub_ok: "🎉 Спасибо! Теперь можно пользоваться магазином.",
    sub_fail: "❌ Подписка не найдена. Пожалуйста, подпишитесь и попробуйте снова.",
  },
  en: {
    choose_lang: "🌐 <b>Choose your language</b>",
    welcome: "Hello, <b>{name}</b>! 🎉\n\nWelcome to <b>{shop}</b> — a <i>trusted shop</i> with fast delivery.\n\n🛍 Tap the button below to open the catalog.",
    open_shop: "🛍 Open shop",
    my_orders: "📦 My orders",
    contact: "📞 Contact",
    lang_btn: "🌐 Language",
    help: "ℹ️ /start — shop · /orders — orders · /lang — language",
    changed_lang: "✅ Language changed",
    need_https: "⚠️ The shop is being configured. Please try later.",
    no_orders: "📦 No orders yet.",
    contact_txt: "📞 <b>Support</b>\n\n{phone}\n{username}\n\n<i>Daily 09:00 — 22:00</i>",
    order_line: "<b>Order #{id}</b> — {status}\n{list}\n\n💰 Total: <b>{total}</b>",
    status_changed: "🔔 <b>Order #{id}</b> status: <b>{status}</b>{comment}",
    blocked: "⛔️ Your account is blocked.",
    ask_phone: "📱 <b>Sign up</b>\n\nPlease share your phone number to enter the shop.\n\n👇 Tap <b>“📱 Share number”</b>.",
    share_phone: "📱 Share number",
    phone_saved: "✅ Phone saved — thank you!",
    sub_required: "📢 <b>Please subscribe to our official channel to use the shop:</b>\n\n👉 {channel}\n\nAfter subscribing tap <b>“✅ I subscribed”</b>.",
    open_channel: "📢 Open channel",
    check_sub: "✅ I subscribed",
    sub_ok: "🎉 Thanks! You can use the shop now.",
    sub_fail: "❌ You are not subscribed yet. Please join and try again.",
  },
};
T.kk = { ...T.ru };
T.tr = { ...T.en };
T.tg = { ...T.ru };

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
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: LANG_NAMES.uz, callback_data: "lang:uz" }, { text: LANG_NAMES.ru, callback_data: "lang:ru" }],
        [{ text: LANG_NAMES.en, callback_data: "lang:en" }, { text: LANG_NAMES.kk, callback_data: "lang:kk" }],
        [{ text: LANG_NAMES.tr, callback_data: "lang:tr" }, { text: LANG_NAMES.tg, callback_data: "lang:tg" }],
      ],
    },
  };
}

function phoneKeyboard(lang) {
  return {
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [[{ text: tr(lang, "share_phone"), request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function subKeyboard(lang) {
  const url = `https://t.me/${config.channelUsername}`;
  return {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: tr(lang, "open_channel"), url }],
        [{ text: tr(lang, "check_sub"), callback_data: "sub:check" }],
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

async function isSubscribed(userId) {
  if (!config.requireSubscription) return true;
  if (!bot) return true;
  try {
    const m = await bot.getChatMember(config.channelId, userId);
    return ["creator", "administrator", "member", "restricted"].includes(m?.status);
  } catch (e) {
    // Kanal ochiq bo'lmasa yoki bot admin bo'lmasa — talab qilmaymiz
    logger.warn("bot", `getChatMember xato: ${e.message}`, null, userId);
    return true;
  }
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

async function askPhone(chatId, lang) {
  await safeSend(chatId, tr(lang, "ask_phone"), phoneKeyboard(lang));
}

async function askSubscription(chatId, lang) {
  await safeSend(chatId, tr(lang, "sub_required", { channel: `@${config.channelUsername}` }), subKeyboard(lang));
}

async function fetchAndStorePhoto(userId) {
  if (!bot) return;
  try {
    const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
    const photo = photos?.photos?.[0]?.slice(-1)?.[0];
    if (!photo) return;
    const file = await bot.getFile(photo.file_id);
    if (!file?.file_path) return;
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    q.setPhotoUrl.run(url, userId);
  } catch (e) {
    // ignore — foydalanuvchi maxfiylik sozlamalari
  }
}

/**
 * Bitta urinish. Xatoda exception tashlaydi — retry mexanizmi shuni ushlaydi.
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

/* -------------------- Onboarding oqimi (til → telefon → obuna) -------------------- */
async function continueOnboarding(chatId, userId, firstName) {
  const row = q.getUser.get(userId);
  const lang = row?.lang || "uz";

  if (!row?.lang_set) {
    await safeSend(chatId, tr("uz", "choose_lang"), langKeyboard());
    return;
  }
  if (config.requirePhone && !row?.phone) {
    await askPhone(chatId, lang);
    return;
  }
  if (config.requireSubscription) {
    const ok = await isSubscribed(userId);
    if (!ok) {
      await askSubscription(chatId, lang);
      return;
    }
  }
  await sendMain(chatId, lang, firstName || row?.first_name);
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

  // Bot username'ni saqlab olamiz — kanal postidagi tugma uchun kerak
  bot.getMe()
    .then((me) => { if (me?.username) config.botUsername = config.botUsername || me.username; })
    .catch(() => {});

  setupCommandMenus();

  // Admin panel + mahsulot qo'shish sehrgari
  try {
    require("./bot_admin").registerAdmin(bot, { safeSend });
  } catch (e) {
    console.error("bot_admin:", e.message);
  }
  try {
    require("./bot_product_wizard").registerProductWizard(bot, { safeSend });
  } catch (e) {
    console.error("bot_product_wizard:", e.message);
  }

  bot.onText(/^\/start(?:\s+(\S+))?/, async (msg) => {
    const f = msg.from;
    q.upsertUser.run(f.id, f.username || null, f.first_name || null, f.last_name || null);
    const row = q.getUser.get(f.id);
    if (row?.blocked) return safeSend(msg.chat.id, tr(row.lang || "uz", "blocked"));
    q.markSeen.run(f.id);
    // Profil suratini fon rejimida yangilaymiz
    fetchAndStorePhoto(f.id).catch(() => {});
    await continueOnboarding(msg.chat.id, f.id, f.first_name);
  });

  bot.onText(/^\/lang/, (msg) => safeSend(msg.chat.id, tr(userLang(msg.from.id), "choose_lang"), langKeyboard()));
  bot.onText(/^\/help/, (msg) => safeSend(msg.chat.id, tr(userLang(msg.from.id), "help")));
  bot.onText(/^\/orders\b/, (msg) => {
    // Admin uchun /orders — bot_admin.js dagi boshqaruv paneli javob beradi
    if (ADMIN_IDS.includes(msg.from.id)) return;
    sendOrders(msg.chat.id, msg.from.id);
  });
  bot.onText(/^\/myorders\b/, (msg) => sendOrders(msg.chat.id, msg.from.id));

  bot.on("callback_query", async (cq) => {
    try {
      if (cq.data?.startsWith("lang:")) {
        const lang = cq.data.split(":")[1];
        if (!LANG_NAMES[lang]) return;
        q.upsertUser.run(cq.from.id, cq.from.username || null, cq.from.first_name || null, cq.from.last_name || null);
        q.setLang.run(lang, cq.from.id);
        q.setLangSet.run(cq.from.id);
        await bot.answerCallbackQuery(cq.id, { text: tr(lang, "changed_lang") }).catch(() => {});
        await bot
          .editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: cq.message.chat.id, message_id: cq.message.message_id })
          .catch(() => {});
        await continueOnboarding(cq.message.chat.id, cq.from.id, cq.from.first_name);
        return;
      }
      if (cq.data === "sub:check") {
        const lang = userLang(cq.from.id);
        const ok = await isSubscribed(cq.from.id);
        if (ok) {
          await bot.answerCallbackQuery(cq.id, { text: tr(lang, "sub_ok") }).catch(() => {});
          await bot
            .editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: cq.message.chat.id, message_id: cq.message.message_id })
            .catch(() => {});
          await sendMain(cq.message.chat.id, lang, cq.from.first_name);
        } else {
          await bot.answerCallbackQuery(cq.id, { text: tr(lang, "sub_fail"), show_alert: true }).catch(() => {});
        }
        return;
      }
    } catch (e) {
      console.error("callback:", e.message);
    }
  });

  // Contact (telefon) qabul qilish
  bot.on("contact", async (msg) => {
    const contact = msg.contact;
    if (!contact || contact.user_id !== msg.from.id) return; // faqat foydalanuvchining o'z raqami
    q.setPhone.run(contact.phone_number, msg.from.id);
    const lang = userLang(msg.from.id);
    await safeSend(msg.chat.id, tr(lang, "phone_saved"));
    await continueOnboarding(msg.chat.id, msg.from.id, msg.from.first_name);
  });

  bot.on("message", async (msg) => {
    if (msg.contact) return; // contact handler ishlab bo'ldi
    if (!msg.text || msg.text.startsWith("/")) return;
    const lang = userLang(msg.from.id);
    const s = getSettings();
    if (msg.text === tr(lang, "my_orders")) return sendOrders(msg.chat.id, msg.from.id);
    if (msg.text === tr(lang, "contact")) {
      const username = s.support_username ? `💬 @${String(s.support_username).replace(/^@/, "")}` : "";
      return safeSend(msg.chat.id, tr(lang, "contact_txt", { phone: esc(s.support_phone), username: esc(username) }), { parse_mode: "HTML" });
    }
    if (msg.text === tr(lang, "lang_btn")) return safeSend(msg.chat.id, tr(lang, "choose_lang"), langKeyboard());
  });

  return bot;
}

/* ------------------ Buyruqlar menyusi (/ tugmasi) ------------------ */
const USER_COMMANDS = [
  { command: "start", description: "🛍 Do'kon / Магазин / Shop" },
  { command: "orders", description: "📦 Buyurtmalarim" },
  { command: "lang", description: "🌐 Til / Язык / Language" },
  { command: "help", description: "ℹ️ Yordam" },
];

const ADMIN_COMMANDS = [
  { command: "admin", description: "🛠 Admin panel" },
  { command: "qoshish", description: "➕ Mahsulot qo'shish (suratlar bilan)" },
  { command: "orders", description: "📦 Buyurtmalar boshqaruvi" },
  { command: "myorders", description: "🛍 Mening buyurtmalarim" },
  { command: "find", description: "🔎 Buyurtma qidirish: /find matn" },
  { command: "clearfilter", description: "🧹 Filtrni tozalash" },
  { command: "report", description: "📊 Kunlik hisobot" },
  { command: "monitoring", description: "📈 Monitoring" },
  { command: "errors", description: "⚠️ Xatoliklar" },
  { command: "queue", description: "🔁 Navbat" },
  { command: "health", description: "❤️ Tizim holati" },
  { command: "audit", description: "📜 Audit jurnali" },
  { command: "rbac", description: "🔐 Rollar" },
  { command: "backup", description: "💾 Zaxira olish" },
  { command: "backups", description: "🗂 Zaxiralar ro'yxati" },
  { command: "restore", description: "♻️ Zaxiradan tiklash" },
  { command: "logzip", description: "📦 Loglarni yuklab olish" },
  { command: "lang", description: "🌐 Til" },
];

function setupCommandMenus() {
  if (!bot) return;
  bot.setMyCommands(USER_COMMANDS, { scope: { type: "default" } }).catch(() => {});
  // Har bir admin uchun shaxsiy chatda to'liq buyruqlar menyusi
  for (const id of ADMIN_IDS) {
    bot
      .setMyCommands(ADMIN_COMMANDS, { scope: { type: "chat", chat_id: id } })
      .catch((e) => logger.warn("bot", `Admin menyusi o'rnatilmadi (${id}): ${e.message}`));
  }
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

/* --------------------------- Kanalga post --------------------------- */
async function postProductToChannel(productId) {
  if (!bot || !config.postProductsToChannel) return null;
  const p = q.getProd.get(productId);
  if (!p || !p.active) return null;
  const imgs = (q.imgsForProd.all(productId) || []).slice(0, 10);
  const s = getSettings();
  const cur = esc(p.currency || s.currency);

  const name = p.name_uz || p.name_ru || p.name_en || "Mahsulot";
  const desc = p.desc_uz || p.desc_ru || p.desc_en || "";
  const priceLine = p.old_price && p.old_price > p.price
    ? `<s>${money(p.old_price)}</s> <b>${money(p.price)}</b> ${cur}`
    : `<b>${money(p.price)}</b> ${cur}`;
  const caption =
    `🛍 <b>${esc(name)}</b>\n\n` +
    (desc ? `${esc(desc)}\n\n` : "") +
    `💰 Narx: ${priceLine}\n` +
    (p.brand ? `🏷 Brend: <b>${esc(p.brand)}</b>\n` : "") +
    (p.sizes ? `📏 O'lchamlar: ${esc(p.sizes)}\n` : "") +
    (p.colors ? `🎨 Ranglar: ${esc(p.colors)}\n` : "") +
    `\n✅ <i>Ishonchli do'kon · Tez yetkazib berish</i>`;

  const botUser = config.botUsername || "";
  const buyUrl = botUser ? `https://t.me/${botUser}?start=p_${productId}` : (config.publicUrl || "");
  const kb = buyUrl
    ? { inline_keyboard: [[{ text: "🛒 Sotib olish", url: buyUrl }]] }
    : undefined;

  try {
    if (imgs.length > 1) {
      const media = imgs.map((im, i) => {
        const url = im.url.startsWith("http") ? im.url : `${config.publicUrl}${im.url}`;
        return {
          type: "photo",
          media: url,
          ...(i === 0 ? { caption, parse_mode: "HTML" } : {}),
        };
      });
      await bot.sendMediaGroup(config.channelId, media);
      if (kb) {
        await bot.sendMessage(config.channelId, `👆 <b>${esc(name)}</b>`, { parse_mode: "HTML", reply_markup: kb });
      }
    } else if (imgs.length === 1) {
      const url = imgs[0].url.startsWith("http") ? imgs[0].url : `${config.publicUrl}${imgs[0].url}`;
      await bot.sendPhoto(config.channelId, url, { caption, parse_mode: "HTML", reply_markup: kb });
    } else {
      await bot.sendMessage(config.channelId, caption, { parse_mode: "HTML", reply_markup: kb });
    }
    logger.info("channel", `Mahsulot kanalga yuborildi: ${productId}`, { channel: config.channelId }, productId);
  } catch (e) {
    logger.error("channel", `Kanalga yuborish xato (${productId}): ${e.message}`, { error: e.message }, productId);
  }
}

async function broadcast(text) {
  if (!bot) return { sent: 0, total: 0 };
  const ids = q.allUserIds.all().map((r) => r.tg_id);
  let sent = 0;
  for (const chatId of ids) {
    const ok = await safeSend(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 45));
  }
  return { sent, total: ids.length, failed: ids.length - sent };
}

module.exports = { startBot, getBot, notifyNewOrder, notifyOrderStatus, broadcast, safeSend, sendOnce, postProductToChannel };
