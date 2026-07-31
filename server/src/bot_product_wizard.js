"use strict";
/**
 * Botning o'zida mahsulot qo'shish sehrgari (admin uchun).
 * 📸 Suratlar (10 tagacha) → nomi → narx → eski narx → tavsif →
 * o'lchamlar → ranglar → kategoriya → tasdiq → bazaga + kanalga post.
 */
const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const { db, q, getSettings } = require("./db");
const { logger } = require("./logger");
const { botAudit } = require("./audit");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const isAdmin = (id) => config.adminIds.includes(Number(id));

/** adminId -> draft */
const sessions = new Map();
const STEPS = ["photos", "name", "price", "old_price", "desc", "sizes", "colors", "category", "confirm"];

function newDraft() {
  return {
    step: "photos",
    images: [],
    name: "", price: 0, old_price: null, desc: "",
    sizes: "", colors: "", brand: "", stock: 10,
    category_id: null,
  };
}

const SKIP_KB = (extra = []) => ({
  inline_keyboard: [
    ...extra,
    [{ text: "⏭ O'tkazib yuborish", callback_data: "pw:skip" }],
    [{ text: "❌ Bekor qilish", callback_data: "pw:cancel" }],
  ],
});

const PROMPTS = {
  photos:
    "📸 <b>1/8 — Mahsulot suratlari</b>\n\n" +
    "Kiyimning suratlarini yuboring (turli rakursda, <b>10 tagacha</b>).\n" +
    "Bir nechta suratni ketma-ket yoki albom qilib yuborsangiz ham bo'ladi.\n\n" +
    "Suratlar tugagach — <b>✅ Suratlar tayyor</b> tugmasini bosing.",
  name: "✍️ <b>2/8 — Mahsulot nomi</b>\n\nMasalan: <code>Klassik ko'ylak Slim Fit</code>",
  price: "💰 <b>3/8 — Narxi</b>\n\nFaqat raqam yozing. Masalan: <code>189000</code>",
  old_price: "🏷 <b>4/8 — Eski narx (chegirma uchun)</b>\n\nChegirma bo'lmasa — o'tkazib yuboring.",
  desc: "📝 <b>5/8 — Tavsif</b>\n\nMato, sifat, xususiyatlari haqida qisqacha yozing.",
  sizes: "📏 <b>6/8 — O'lchamlar</b>\n\nMasalan: <code>S, M, L, XL, XXL</code>",
  colors: "🎨 <b>7/8 — Ranglar</b>\n\nMasalan: <code>Qora, Oq, Bej</code>",
  category: "🗂 <b>8/8 — Kategoriya</b>\n\nQuyidagidan tanlang:",
};

function catName(c) {
  return c.name_uz || c.name_ru || c.name_en || `#${c.id}`;
}

function categoryKeyboard() {
  const cats = (q.listCats.all() || []).filter((c) => c.active !== 0);
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    rows.push(
      cats.slice(i, i + 2).map((c) => ({
        text: `${c.icon || "🏷"} ${catName(c)}`,
        callback_data: `pw:cat:${c.id}`,
      }))
    );
  }
  rows.push([{ text: "➖ Kategoriyasiz", callback_data: "pw:cat:0" }]);
  rows.push([{ text: "❌ Bekor qilish", callback_data: "pw:cancel" }]);
  return { inline_keyboard: rows };
}

function previewText(d) {
  const s = getSettings();
  const cur = esc(s.currency || "UZS");
  const cat = d.category_id ? q.getCat.get(d.category_id) : null;
  const priceLine = d.old_price && d.old_price > d.price
    ? `<s>${money(d.old_price)}</s> <b>${money(d.price)}</b> ${cur}`
    : `<b>${money(d.price)}</b> ${cur}`;
  return (
    "🔎 <b>Tekshiring — hammasi to'g'rimi?</b>\n\n" +
    `🛍 <b>${esc(d.name)}</b>\n` +
    (d.desc ? `${esc(d.desc)}\n` : "") +
    `\n💰 Narx: ${priceLine}\n` +
    (d.sizes ? `📏 O'lchamlar: ${esc(d.sizes)}\n` : "") +
    (d.colors ? `🎨 Ranglar: ${esc(d.colors)}\n` : "") +
    `🗂 Kategoriya: <b>${cat ? esc(catName(cat)) : "—"}</b>\n` +
    `📸 Suratlar: <b>${d.images.length} ta</b>\n\n` +
    (config.postProductsToChannel
      ? `📢 Tasdiqlansa — <b>@${esc(config.channelUsername)}</b> kanaliga surat + ma'lumot bilan avtomatik yuboriladi.`
      : "ℹ️ Kanalga yuborish o'chirilgan.")
  );
}

const CONFIRM_KB = {
  inline_keyboard: [
    [{ text: "✅ Saqlash va kanalga yuborish", callback_data: "pw:save" }],
    [{ text: "🔁 Boshidan", callback_data: "pw:new" }, { text: "❌ Bekor", callback_data: "pw:cancel" }],
  ],
};

function photosKb(n) {
  return {
    inline_keyboard: [
      [{ text: `✅ Suratlar tayyor (${n})`, callback_data: "pw:photos_done" }],
      [{ text: "❌ Bekor qilish", callback_data: "pw:cancel" }],
    ],
  };
}

function registerProductWizard(bot, { safeSend }) {
  const send = (chatId, text, kb) =>
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: kb });

  async function ask(chatId, d) {
    if (d.step === "photos") return send(chatId, PROMPTS.photos, photosKb(d.images.length));
    if (d.step === "name") return send(chatId, PROMPTS.name, { inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "pw:cancel" }]] });
    if (d.step === "price") return send(chatId, PROMPTS.price, { inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: "pw:cancel" }]] });
    if (d.step === "category") return send(chatId, PROMPTS.category, categoryKeyboard());
    if (d.step === "confirm") return send(chatId, previewText(d), CONFIRM_KB);
    return send(chatId, PROMPTS[d.step], SKIP_KB());
  }

  function next(d) {
    const i = STEPS.indexOf(d.step);
    d.step = STEPS[Math.min(i + 1, STEPS.length - 1)];
  }

  async function start(chatId, userId) {
    const d = newDraft();
    sessions.set(userId, d);
    await send(
      chatId,
      "🆕 <b>Yangi mahsulot qo'shish</b>\n\n" +
        "Bosqichma-bosqich to'ldiramiz. Istalgan payt <b>❌ Bekor qilish</b> tugmasini bosishingiz mumkin.",
      undefined
    );
    await ask(chatId, d);
  }

  async function saveTelegramPhoto(fileId) {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const link = await bot.getFileLink(fileId);
    const res = await fetch(link);
    if (!res.ok) throw new Error(`Telegram fayl yuklanmadi (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  }

  /* ---------------- Suratlar ---------------- */
  bot.on("photo", async (msg) => {
    const uid = msg.from?.id;
    if (!uid || !isAdmin(uid)) return;
    const d = sessions.get(uid);
    if (!d || d.step !== "photos") return;
    if (d.images.length >= 10) {
      return send(msg.chat.id, "⚠️ 10 tadan ortiq surat bo'lmaydi. <b>✅ Suratlar tayyor</b>ni bosing.", photosKb(d.images.length));
    }
    const best = msg.photo[msg.photo.length - 1];
    try {
      const url = await saveTelegramPhoto(best.file_id);
      d.images.push(url);
      await send(msg.chat.id, `📸 Qabul qilindi — <b>${d.images.length}/10</b>. Yana yuboring yoki tugmani bosing.`, photosKb(d.images.length));
    } catch (e) {
      logger.error("bot", `Surat saqlanmadi: ${e.message}`);
      await send(msg.chat.id, `❌ Surat saqlanmadi: ${esc(e.message)}`, photosKb(d.images.length));
    }
  });

  /* ---------------- Matnli qadamlar ---------------- */
  bot.on("message", async (msg) => {
    const uid = msg.from?.id;
    if (!uid || !isAdmin(uid)) return;
    const d = sessions.get(uid);
    if (!d) return;
    const text = (msg.text || "").trim();
    if (!text || text.startsWith("/")) return;
    const chatId = msg.chat.id;

    switch (d.step) {
      case "photos":
        return send(chatId, "📸 Avval suratlarni yuboring yoki <b>✅ Suratlar tayyor</b>ni bosing.", photosKb(d.images.length));
      case "name":
        d.name = text.slice(0, 120); break;
      case "price": {
        const v = Number(text.replace(/[^\d]/g, ""));
        if (!v) return send(chatId, "❌ Narx faqat raqam bo'lishi kerak. Masalan: <code>189000</code>");
        d.price = v; break;
      }
      case "old_price": {
        const v = Number(text.replace(/[^\d]/g, ""));
        d.old_price = v || null; break;
      }
      case "desc": d.desc = text.slice(0, 900); break;
      case "sizes": d.sizes = text.slice(0, 120); break;
      case "colors": d.colors = text.slice(0, 120); break;
      default: return;
    }
    next(d);
    await ask(chatId, d);
  });

  /* ---------------- Tugmalar ---------------- */
  bot.on("callback_query", async (cq) => {
    const data = cq.data || "";
    if (!data.startsWith("pw:")) return;
    const uid = cq.from.id;
    const chatId = cq.message.chat.id;
    if (!isAdmin(uid)) {
      return bot.answerCallbackQuery(cq.id, { text: "Ruxsat yo'q", show_alert: true }).catch(() => {});
    }
    await bot.answerCallbackQuery(cq.id).catch(() => {});
    const [, action, arg] = data.split(":");

    if (action === "new") return start(chatId, uid);

    const d = sessions.get(uid);
    if (!d) return send(chatId, "ℹ️ Sessiya tugagan. Qaytadan boshlash: /qoshish");

    if (action === "cancel") {
      sessions.delete(uid);
      return send(chatId, "❌ Bekor qilindi. Yangisini boshlash: /qoshish");
    }

    if (action === "photos_done") {
      if (!d.images.length) return send(chatId, "⚠️ Kamida 1 ta surat kerak.", photosKb(0));
      next(d);
      return ask(chatId, d);
    }

    if (action === "skip") { next(d); return ask(chatId, d); }

    if (action === "cat") {
      d.category_id = Number(arg) || null;
      d.step = "confirm";
      return ask(chatId, d);
    }

    if (action === "save") {
      try {
        const id = saveProduct(d);
        sessions.delete(uid);
        botAudit(cq.from, "product.create.bot", String(id), { name: d.name, images: d.images.length });
        await send(
          chatId,
          `✅ <b>Mahsulot qo'shildi!</b>\n\n🆔 ID: <code>${id}</code>\n🛍 ${esc(d.name)}\n📸 ${d.images.length} ta surat\n\n` +
            (config.postProductsToChannel ? `📢 Kanalga yuborilmoqda…` : "ℹ️ Kanalga yuborish o'chirilgan."),
          { inline_keyboard: [[{ text: "➕ Yana qo'shish", callback_data: "pw:new" }], [{ text: "🛠 Admin panel", callback_data: "adm:menu" }]] }
        );
        try {
          const { postProductToChannel } = require("./bot");
          setImmediate(() => postProductToChannel(id).catch(() => {}));
        } catch (e) { /* noop */ }
      } catch (e) {
        logger.error("bot", `Mahsulot saqlanmadi: ${e.message}`);
        await send(chatId, `❌ Saqlashda xato: ${esc(e.message)}`);
      }
    }
  });

  bot.onText(/^\/(qoshish|addproduct|mahsulot)\b/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    await start(msg.chat.id, msg.from.id);
  });

  logger.info("bot", "Mahsulot qo'shish sehrgari yoqildi (/qoshish)");
}

function saveProduct(d) {
  const args = [
    d.category_id || null,
    d.name, d.name, d.name, d.name, d.name, d.name,
    d.desc, d.desc, d.desc, d.desc, d.desc, d.desc,
    d.price, d.old_price || null,
    d.brand || "", d.colors || "", d.sizes || "",
    d.stock || 10, 1, 1,
  ];
  return db.transaction(() => {
    const info = q.addProd.run(...args);
    const id = Number(info.lastInsertRowid);
    d.images.forEach((url, i) => q.addImg.run(id, url, i));
    return id;
  })();
}

module.exports = { registerProductWizard };
