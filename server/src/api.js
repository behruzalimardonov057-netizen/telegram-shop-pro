"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { config } = require("./config");
const { q, db, getSettings, saveSettings } = require("./db");
const { tgAuth, adminAuth, signAdminToken } = require("./auth");
const roles = require("./roles");
const { logger } = require("./logger");
const { enqueue } = require("./retry");
const { notifyNewOrder, notifyOrderStatus, broadcast } = require("./bot");

const router = express.Router();

// Har bir /admin/* so'roviga rol asosidagi ruxsat tekshiruvi
router.use(adminGuard);
function adminGuard(req, res, next) {
  if (!req.path.startsWith("/admin/") || req.path === "/admin/login") return next();
  adminAuth(req, res, (err) => {
    if (err) return next(err);
    roles.permGuard(req, res, next);
  });
}

const LANGS = ["uz", "ru", "en", "kk", "tr", "tg"];
const STATUSES = ["new", "paid", "packing", "shipping", "delivered", "cancelled"];

/* ============================ Upload ============================ */
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] || ".jpg";
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) return cb(new Error("Faqat rasm fayllari (jpg, png, webp, gif)"));
    cb(null, true);
  },
});

/* ============================ Helpers ============================ */
function localize(obj, lang, base = "name") {
  return obj[`${base}_${lang}`] || obj[`${base}_uz`] || obj[`${base}_ru`] || obj[`${base}_en`] || "";
}

function attachImages(products) {
  if (!products.length) return products;
  const ids = [...new Set(products.map((p) => p.id))];
  const ph = ids.map(() => "?").join(",");
  const imgs = db
    .prepare(`SELECT product_id, url FROM product_images WHERE product_id IN (${ph}) ORDER BY sort, id`)
    .all(...ids);
  const map = {};
  for (const im of imgs) (map[im.product_id] ||= []).push(im.url);
  return products.map((p) => ({ ...p, images: map[p.id] || [] }));
}

function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    req[source === "query" ? "vquery" : "body"] = parsed.data;
    next();
  };
}

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = z.coerce.number().int().positive();
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const txt = (max = 200) => z.string().trim().max(max);
const langFields = (base) =>
  Object.fromEntries(LANGS.map((l) => [`${base}_${l}`, txt(base === "desc" ? 4000 : 160).optional().default("")]));

/* ============================ PUBLIC ============================ */
router.post("/me", tgAuth, (req, res) => {
  const u = req.user;
  q.upsertUser.run(u.id, u.username || null, u.first_name || null, u.last_name || null);
  q.markSeen.run(u.id);
  res.json({ user: q.getUser.get(u.id) });
});

router.post("/set-lang", tgAuth, validate(z.object({ lang: z.enum(LANGS) })), (req, res) => {
  q.setLang.run(req.body.lang, req.user.id);
  res.json({ ok: true });
});

router.post(
  "/set-country",
  tgAuth,
  validate(z.object({ country_id: id.nullable().optional() })),
  (req, res) => {
    q.setCountry.run(req.body.country_id ?? null, req.user.id);
    res.json({ ok: true });
  }
);

router.get("/config", (req, res) => {
  const s = getSettings();
  let methods = ["cash"];
  try {
    methods = JSON.parse(s.payment_methods);
  } catch {}
  res.json({
    shop_name: s.shop_name,
    currency: s.currency,
    langs: LANGS,
    support_phone: s.support_phone,
    support_username: s.support_username,
    about: s.about,
    free_shipping_from: Number(s.free_shipping_from) || 0,
    min_order_total: Number(s.min_order_total) || 0,
    payment_methods: methods,
    card_number: s.card_number,
    card_holder: s.card_holder,
  });
});

router.get("/home", (req, res) => {
  res.json({
    banners: q.listBanners.all(),
    categories: q.listCats.all().filter((c) => c.active),
    featured: attachImages(q.featProds.all()),
    latest: attachImages(q.listProds.all().slice(0, 20)),
  });
});

router.get("/categories", (req, res) => res.json(q.listCats.all().filter((c) => c.active)));
router.get("/countries", (req, res) => res.json(q.listCountries.all()));

const productQuery = z.object({
  category: id.optional(),
  q: txt(80).optional(),
  min: money.optional(),
  max: money.optional(),
  sort: z.enum(["new", "price_asc", "price_desc", "popular"]).optional(),
  in_stock: z.coerce.boolean().optional(),
});

router.get("/products", validate(productQuery, "query"), (req, res) => {
  const { category, q: search, min, max, sort, in_stock } = req.vquery;
  let items;
  if (search) {
    const s = `%${search}%`;
    items = q.searchProds.all(s, s, s, s);
  } else if (category) {
    items = q.prodsByCat.all(category);
  } else {
    items = q.listProds.all();
  }
  if (min !== undefined) items = items.filter((p) => p.price >= min);
  if (max !== undefined) items = items.filter((p) => p.price <= max);
  if (in_stock) items = items.filter((p) => p.stock > 0);
  if (sort === "price_asc") items.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") items.sort((a, b) => b.price - a.price);
  if (sort === "popular") items.sort((a, b) => (b.sold || 0) - (a.sold || 0));
  res.json(attachImages(items));
});

router.get("/products/:id", (req, res) => {
  const p = q.getProd.get(Number(req.params.id));
  if (!p || !p.active) return res.status(404).json({ error: "not found" });
  res.json(attachImages([p])[0]);
});

/* ---------------------------- Cart ---------------------------- */
function cartWithImages(userId) {
  const items = q.getCart.all(userId);
  if (!items.length) return [];
  const imgs = attachImages(items.map((i) => ({ id: i.product_id })));
  const byId = Object.fromEntries(imgs.map((x) => [x.id, x.images]));
  return items.map((i) => ({ ...i, images: byId[i.product_id] || [] }));
}

router.get("/cart", tgAuth, (req, res) => res.json(cartWithImages(req.user.id)));

router.post(
  "/cart/add",
  tgAuth,
  validate(
    z.object({
      product_id: id,
      size: txt(40).optional().nullable(),
      color: txt(40).optional().nullable(),
      qty: z.coerce.number().int().min(1).max(99).default(1),
    })
  ),
  (req, res) => {
    const { product_id, size, color, qty } = req.body;
    const p = q.getProd.get(product_id);
    if (!p || !p.active) return res.status(404).json({ error: "product not found" });
    if (p.stock <= 0) return res.status(409).json({ error: "out of stock" });
    q.addCartItem.run(req.user.id, product_id, size || null, color || null, Math.min(qty, p.stock));
    res.json({ ok: true });
  }
);

router.post(
  "/cart/update",
  tgAuth,
  validate(z.object({ id, qty: z.coerce.number().int().min(0).max(99) })),
  (req, res) => {
    if (req.body.qty === 0) q.delCartItem.run(req.body.id, req.user.id);
    else q.updateCartQty.run(req.body.qty, req.body.id, req.user.id);
    res.json({ ok: true });
  }
);

router.post("/cart/delete", tgAuth, validate(z.object({ id })), (req, res) => {
  q.delCartItem.run(req.body.id, req.user.id);
  res.json({ ok: true });
});

router.post("/cart/clear", tgAuth, (req, res) => {
  q.clearCart.run(req.user.id);
  res.json({ ok: true });
});

/* -------------------------- Favorites -------------------------- */
router.get("/favorites", tgAuth, (req, res) => res.json(attachImages(q.listFavs.all(req.user.id))));

router.post("/favorites/toggle", tgAuth, validate(z.object({ product_id: id })), (req, res) => {
  const pid = req.body.product_id;
  const exists = q.isFav.get(req.user.id, pid);
  if (exists) q.delFav.run(req.user.id, pid);
  else q.addFav.run(req.user.id, pid);
  res.json({ favorited: !exists });
});

/* ---------------------------- Promo ---------------------------- */
function resolvePromo(code, subtotal) {
  if (!code) return { discount: 0, promo: null };
  const p = q.getPromo.get(String(code).toUpperCase());
  if (!p) return { discount: 0, promo: null, reason: "not_found" };
  if (p.max_uses > 0 && (p.used || 0) >= p.max_uses) return { discount: 0, promo: null, reason: "limit" };
  if ((p.min_total || 0) > subtotal) return { discount: 0, promo: null, reason: "min_total", min_total: p.min_total };
  return { discount: Math.floor((subtotal * p.percent) / 100), promo: p };
}

router.post("/promo/check", tgAuth, validate(z.object({ code: txt(40) })), (req, res) => {
  const subtotal = q.getCart.all(req.user.id).reduce((s, i) => s + i.price * i.qty, 0);
  const r = resolvePromo(req.body.code, subtotal);
  if (!r.promo) return res.json({ valid: false, reason: r.reason, min_total: r.min_total });
  res.json({ valid: true, percent: r.promo.percent, discount: r.discount });
});

/* --------------------------- Checkout --------------------------- */
router.get("/checkout/preview", tgAuth, (req, res) => {
  const items = q.getCart.all(req.user.id);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const country = req.query.country_id ? q.getCountry.get(Number(req.query.country_id)) : null;
  const s = getSettings();
  const freeFrom = Number(country?.free_from || s.free_shipping_from) || 0;
  const shipping = !country || (freeFrom > 0 && subtotal >= freeFrom) ? 0 : country.shipping_price;
  const { discount } = resolvePromo(req.query.promo, subtotal);
  res.json({ subtotal, shipping, discount, total: Math.max(subtotal + shipping - discount, 0) });
});

const orderSchema = z.object({
  name: txt(80).min(2),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s().-]{7,20}$/, "Telefon raqami noto'g'ri"),
  address: txt(300).min(4),
  country_id: id.optional().nullable(),
  city: txt(80).optional().default(""),
  payment: z.enum(["cash", "card", "click", "payme", "transfer"]).default("cash"),
  promo: txt(40).optional().nullable(),
  note: txt(500).optional().default(""),
});

router.post("/orders", tgAuth, validate(orderSchema), (req, res) => {
  const b = req.body;
  const settings = getSettings();
  let allowed = ["cash"];
  try {
    allowed = JSON.parse(settings.payment_methods);
  } catch {}
  if (!allowed.includes(b.payment)) return res.status(400).json({ error: "payment method not allowed" });

  const result = db.transaction(() => {
    const items = q.getCart.all(req.user.id);
    if (!items.length) throw Object.assign(new Error("empty cart"), { status: 400 });

    // Zaxirani tekshirish
    for (const i of items) {
      const p = q.getProd.get(i.product_id);
      if (!p || !p.active) throw Object.assign(new Error(`Mahsulot mavjud emas`), { status: 409 });
      if (p.stock < i.qty)
        throw Object.assign(new Error(`"${localize(p, "uz")}" — omborda ${p.stock} dona qoldi`), { status: 409 });
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const minTotal = Number(settings.min_order_total) || 0;
    if (minTotal > 0 && subtotal < minTotal)
      throw Object.assign(new Error(`Minimal buyurtma summasi: ${minTotal}`), { status: 400 });

    const country = b.country_id ? q.getCountry.get(b.country_id) : null;
    const freeFrom = Number(country?.free_from || settings.free_shipping_from) || 0;
    const shipping = !country || (freeFrom > 0 && subtotal >= freeFrom) ? 0 : country.shipping_price;

    const { discount, promo } = resolvePromo(b.promo, subtotal);
    const total = Math.max(subtotal + shipping - discount, 0);

    const itemsJson = JSON.stringify(
      items.map((i) => ({
        product_id: i.product_id,
        name: localize(i, req.dbUser?.lang || "uz"),
        size: i.size,
        color: i.color,
        qty: i.qty,
        price: i.price,
      }))
    );

    const info = q.addOrder.run(
      req.user.id,
      b.name,
      b.phone,
      b.address,
      b.country_id || null,
      b.city || null,
      itemsJson,
      subtotal,
      shipping,
      discount,
      total,
      b.payment,
      promo ? promo.code : null,
      b.note || null
    );
    const orderId = Number(info.lastInsertRowid);

    for (const i of items) q.decStock.run(i.qty, i.qty, i.product_id);
    if (promo) q.usePromo.run(promo.id);
    q.setPhone.run(b.phone, req.user.id);
    q.clearCart.run(req.user.id);
    q.addEvent.run(orderId, "new", "Buyurtma yaratildi");
    db.prepare("UPDATE orders SET currency=? WHERE id=?").run(country?.currency || settings.currency, orderId);

    return q.getOrder.get(orderId);
  });

  let order;
  try {
    order = result();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  logger.info("order", `Yangi buyurtma #${order.id} — ${order.total}`, { user: order.user_id, total: order.total }, order.id);
  try {
    notifyNewOrder(order);
  } catch (e) {
    logger.error("order", `Bildirishnoma yuborilmadi #${order.id}`, { error: e.message }, order.id);
    enqueue("order_notify", { orderId: order.id }, { refId: String(order.id) });
  }
  res.json({ ok: true, order_id: order.id, order });
});

router.get("/orders", tgAuth, (req, res) => res.json(q.userOrders.all(req.user.id)));

router.get("/orders/:id", tgAuth, (req, res) => {
  const o = q.getOrder.get(Number(req.params.id));
  if (!o || o.user_id !== req.user.id) return res.status(404).json({ error: "not found" });
  res.json({ ...o, events: q.orderEvents.all(o.id) });
});

router.post("/orders/:id/cancel", tgAuth, (req, res) => {
  const oid = Number(req.params.id);
  const o = q.getOrder.get(oid);
  if (!o || o.user_id !== req.user.id) return res.status(404).json({ error: "not found" });
  if (!["new", "paid"].includes(o.status)) return res.status(409).json({ error: "cannot cancel" });
  db.transaction(() => {
    q.setOrderStatus.run("cancelled", oid);
    q.addEvent.run(oid, "cancelled", "Mijoz bekor qildi");
    for (const i of JSON.parse(o.items_json)) q.incStock.run(i.qty, i.qty, i.product_id);
  })();
  res.json({ ok: true });
});

/* ============================ ADMIN ============================ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring." },
});

function checkPassword(plain) {
  if (config.adminPasswordHash) return bcrypt.compareSync(plain, config.adminPasswordHash);
  const a = Buffer.from(plain);
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post(
  "/admin/login",
  loginLimiter,
  validate(z.object({ login: txt(60), password: z.string().min(1).max(200) })),
  (req, res) => {
    const meta = { ip: req.ip, ua: req.get("user-agent") || "" };
    let result = roles.verifyCredentials(req.body.login, req.body.password, meta);

    // Zaxira yo'l: baza bo'sh bo'lsa .env dagi hisob bilan kirish
    if (!result && req.body.login === config.adminLogin && checkPassword(req.body.password)) {
      result = {
        claims: { uid: 0, login: config.adminLogin, role: "superadmin", perms: roles.PERMISSIONS, name: "Bosh admin" },
        user: { login: config.adminLogin, role: "superadmin", perms: roles.PERMISSIONS, name: "Bosh admin" },
      };
      logger.warn("auth", `.env hisobi bilan kirish: ${config.adminLogin}`, meta);
    }
    if (!result) return res.status(401).json({ error: "Login yoki parol noto'g'ri" });

    res.json({
      token: signAdminToken(result.claims),
      user: { login: result.user.login, name: result.user.name, role: result.user.role, perms: result.user.perms },
    });
  }
);

router.get("/admin/session", adminAuth, (req, res) =>
  res.json({
    ok: true,
    login: req.admin.login,
    name: req.admin.name || "",
    role: req.admin.role,
    perms: req.admin.perms || [],
    all_permissions: roles.PERMISSIONS,
  })
);

router.post("/admin/upload", adminAuth, (req, res) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ urls: (req.files || []).map((f) => `/uploads/${f.filename}`) });
  });
});

/* ------------------------- Products ------------------------- */
const productSchema = z.object({
  category_id: id,
  ...langFields("name"),
  ...langFields("desc"),
  price: money,
  old_price: money.nullable().optional(),
  brand: txt(80).optional().default(""),
  colors: txt(300).optional().default(""),
  sizes: txt(300).optional().default(""),
  stock: z.coerce.number().int().min(0).max(1000000).default(0),
  active: z.coerce.boolean().default(true),
  featured: z.coerce.boolean().default(false),
  images: z.array(txt(500)).max(10).optional().default([]),
});

function productArgs(p) {
  return [
    p.category_id,
    ...LANGS.map((l) => p[`name_${l}`] || ""),
    ...LANGS.map((l) => p[`desc_${l}`] || ""),
    p.price,
    p.old_price || null,
    p.brand,
    p.colors,
    p.sizes,
    p.stock,
    p.active ? 1 : 0,
    p.featured ? 1 : 0,
  ];
}

router.get("/admin/products", adminAuth, (req, res) => res.json(attachImages(q.listAllProds.all())));

router.post("/admin/products", adminAuth, validate(productSchema), (req, res) => {
  const p = req.body;
  const pid = db.transaction(() => {
    const info = q.addProd.run(...productArgs(p));
    const newId = Number(info.lastInsertRowid);
    p.images.forEach((url, i) => q.addImg.run(newId, url, i));
    return newId;
  })();
  // Kanalga fon rejimida yuboramiz
  try {
    const { postProductToChannel } = require("./bot");
    setImmediate(() => { postProductToChannel(pid).catch(() => {}); });
  } catch (e) {}
  res.json({ id: pid });
});

router.put("/admin/products/:id", adminAuth, validate(productSchema), (req, res) => {
  const pid = Number(req.params.id);
  const p = req.body;
  db.transaction(() => {
    q.updProd.run(...productArgs(p), pid);
    q.delImgsForProd.run(pid);
    p.images.forEach((url, i) => q.addImg.run(pid, url, i));
  })();
  res.json({ ok: true });
});

router.delete("/admin/products/:id", adminAuth, (req, res) => {
  q.delProd.run(Number(req.params.id));
  res.json({ ok: true });
});

/* ------------------------ Categories ------------------------ */
const categorySchema = z.object({
  parent_id: id.nullable().optional(),
  ...langFields("name"),
  icon: txt(16).optional().default(""),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.boolean().default(true),
});

router.get("/admin/categories", adminAuth, (req, res) => res.json(q.listCats.all()));

router.post("/admin/categories", adminAuth, validate(categorySchema), (req, res) => {
  const c = req.body;
  const info = q.addCat.run(c.parent_id || null, ...LANGS.map((l) => c[`name_${l}`]), c.icon, c.sort);
  res.json({ id: Number(info.lastInsertRowid) });
});

router.put("/admin/categories/:id", adminAuth, validate(categorySchema), (req, res) => {
  const c = req.body;
  q.updCat.run(
    c.parent_id || null,
    ...LANGS.map((l) => c[`name_${l}`]),
    c.icon,
    c.sort,
    c.active ? 1 : 0,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

router.delete("/admin/categories/:id", adminAuth, (req, res) => {
  const cid = Number(req.params.id);
  const used = db.prepare("SELECT COUNT(*) c FROM products WHERE category_id=?").get(cid).c;
  if (used) return res.status(409).json({ error: `Bu kategoriyada ${used} ta mahsulot bor` });
  q.delCat.run(cid);
  res.json({ ok: true });
});

/* ------------------------- Countries ------------------------- */
const countrySchema = z.object({
  code: txt(4).min(2),
  ...langFields("name"),
  flag: txt(8).optional().default(""),
  currency: txt(8).optional().default("UZS"),
  shipping_price: money.default(0),
  free_from: money.default(0),
  active: z.coerce.boolean().default(true),
});

router.get("/admin/countries", adminAuth, (req, res) => res.json(q.listAllCountries.all()));

router.post("/admin/countries", adminAuth, validate(countrySchema), (req, res) => {
  const c = req.body;
  const info = q.addCountry.run(
    c.code.toUpperCase(),
    ...LANGS.map((l) => c[`name_${l}`]),
    c.flag,
    c.currency,
    c.shipping_price
  );
  const cid = Number(info.lastInsertRowid);
  db.prepare("UPDATE countries SET free_from=? WHERE id=?").run(c.free_from, cid);
  res.json({ id: cid });
});

router.put("/admin/countries/:id", adminAuth, validate(countrySchema), (req, res) => {
  const c = req.body;
  const cid = Number(req.params.id);
  q.updCountry.run(
    c.code.toUpperCase(),
    ...LANGS.map((l) => c[`name_${l}`]),
    c.flag,
    c.currency,
    c.shipping_price,
    c.active ? 1 : 0,
    cid
  );
  db.prepare("UPDATE countries SET free_from=? WHERE id=?").run(c.free_from, cid);
  res.json({ ok: true });
});

router.delete("/admin/countries/:id", adminAuth, (req, res) => {
  q.delCountry.run(Number(req.params.id));
  res.json({ ok: true });
});

/* -------------------------- Banners -------------------------- */
router.get("/admin/banners", adminAuth, (req, res) => res.json(q.listAllBanners.all()));

router.post(
  "/admin/banners",
  adminAuth,
  validate(z.object({ image: txt(500).min(1), link: txt(300).optional().default(""), sort: z.coerce.number().int().default(0) })),
  (req, res) => {
    const info = q.addBanner.run(req.body.image, req.body.link, req.body.sort);
    res.json({ id: Number(info.lastInsertRowid) });
  }
);

router.delete("/admin/banners/:id", adminAuth, (req, res) => {
  q.delBanner.run(Number(req.params.id));
  res.json({ ok: true });
});

/* --------------------------- Orders --------------------------- */
router.get("/admin/orders", adminAuth, (req, res) => {
  const status = req.query.status;
  let rows = q.allOrders.all();
  if (status && STATUSES.includes(status)) rows = rows.filter((o) => o.status === status);
  res.json(rows);
});

router.get("/admin/orders/:id", adminAuth, (req, res) => {
  const o = q.getOrder.get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: "not found" });
  res.json({ ...o, events: q.orderEvents.all(o.id) });
});

router.post(
  "/admin/orders/:id/status",
  adminAuth,
  validate(z.object({ status: z.enum(STATUSES), comment: txt(300).optional().default("") })),
  asyncH(async (req, res) => {
    const oid = Number(req.params.id);
    const o = q.getOrder.get(oid);
    if (!o) return res.status(404).json({ error: "not found" });
    const next = req.body.status;

    db.transaction(() => {
      q.setOrderStatus.run(next, oid);
      q.addEvent.run(oid, next, req.body.comment || null);
      if (next === "paid") q.setOrderPaid.run(1, oid);
      if (next === "cancelled" && o.status !== "cancelled") {
        for (const i of JSON.parse(o.items_json)) q.incStock.run(i.qty, i.qty, i.product_id);
      }
    })();

    logger.info("order", `Buyurtma #${oid} holati: ${next}`, { by: req.admin?.login, comment: req.body.comment }, oid);
    try {
      await notifyOrderStatus(q.getOrder.get(oid), req.body.comment);
    } catch (e) {
      logger.error("order", `Status bildirishnomasi xato #${oid}`, { error: e.message }, oid);
      enqueue("status_notify", { orderId: oid, comment: req.body.comment || "" }, { refId: String(oid) });
    }
    res.json({ ok: true });
  })
);

/* --------------------------- Users --------------------------- */
router.get("/admin/users", adminAuth, (req, res) => res.json(q.listUsers.all()));

router.post("/admin/users/:id/block", adminAuth, validate(z.object({ blocked: z.coerce.boolean() })), (req, res) => {
  q.setBlocked.run(req.body.blocked ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});

router.post(
  "/admin/broadcast",
  adminAuth,
  validate(z.object({ text: z.string().trim().min(1).max(3500) })),
  asyncH(async (req, res) => res.json(await broadcast(req.body.text)))
);

/* --------------------------- Promo --------------------------- */
const promoSchema = z.object({
  code: txt(40).min(2),
  percent: z.coerce.number().int().min(1).max(90),
  active: z.coerce.boolean().default(true),
  expires_at: z.string().optional().nullable(),
  min_total: money.default(0),
  max_uses: z.coerce.number().int().min(0).max(1000000).default(0),
});

router.get("/admin/promo", adminAuth, (req, res) => res.json(q.listPromos.all()));

router.post("/admin/promo", adminAuth, validate(promoSchema), (req, res) => {
  const p = req.body;
  const exp = p.expires_at ? Math.floor(new Date(p.expires_at).getTime() / 1000) : null;
  try {
    const info = q.addPromo.run(p.code.toUpperCase(), p.percent, p.active ? 1 : 0, exp);
    const pid = Number(info.lastInsertRowid);
    db.prepare("UPDATE promo_codes SET min_total=?, max_uses=? WHERE id=?").run(p.min_total, p.max_uses, pid);
    res.json({ id: pid });
  } catch (e) {
    res.status(409).json({ error: "Bu promo-kod allaqachon mavjud" });
  }
});

router.delete("/admin/promo/:id", adminAuth, (req, res) => {
  q.delPromo.run(Number(req.params.id));
  res.json({ ok: true });
});

/* -------------------------- Settings -------------------------- */
router.get("/admin/settings", adminAuth, (req, res) => res.json(getSettings()));

router.put(
  "/admin/settings",
  adminAuth,
  validate(
    z.object({
      shop_name: txt(80).optional(),
      currency: txt(8).optional(),
      support_phone: txt(40).optional(),
      support_username: txt(40).optional(),
      about: txt(2000).optional(),
      free_shipping_from: money.optional(),
      min_order_total: money.optional(),
      payment_methods: z.array(z.enum(["cash", "card", "click", "payme", "transfer"])).optional(),
      card_number: txt(40).optional(),
      card_holder: txt(80).optional(),
    })
  ),
  (req, res) => {
    const body = { ...req.body };
    if (body.payment_methods) body.payment_methods = JSON.stringify(body.payment_methods);
    res.json(saveSettings(body));
  }
);

/* ------------------------ Translations ------------------------ */
router.get("/admin/translations", adminAuth, (req, res) => res.json(q.allT.all()));

router.post(
  "/admin/translations",
  adminAuth,
  validate(z.object({ key: txt(80).min(1), lang: txt(8).min(2), value: txt(1000) })),
  (req, res) => {
    q.setT.run(req.body.key, req.body.lang, req.body.value);
    res.json({ ok: true });
  }
);

/* --------------------------- Stats --------------------------- */
router.get("/admin/stats", adminAuth, (req, res) => {
  res.json({
    users: q.countUsers.get().c,
    products: q.countProducts.get().c,
    orders: q.countOrders.get().c,
    revenue: q.revenueSum.get().s,
    byDay: q.revenueByDay.all(),
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, q.ordersByStatus.get(s).c])),
    top: q.topProducts.all(),
  });
});


/* --------------------------- Audit & log export (v5) --------------------------- */
const { listAudit } = require("./audit");
const { buildZip } = require("./zip");
const { listLogs: _listLogs, logStats: _logStats } = require("./logger");

router.get("/admin/audit", adminAuth, (req, res) => {
  const { actor, action, since, limit, offset } = req.query;
  res.json(listAudit({
    actor, action, since,
    limit: Math.min(Number(limit) || 100, 500),
    offset: Number(offset) || 0,
  }));
});

router.get("/admin/logs/export.zip", adminAuth, (req, res) => {
  const all = _listLogs({ limit: 10000 }).rows;
  const errors = _listLogs({ level: "error", limit: 5000 }).rows;
  const audit = listAudit({ limit: 10000 }).rows;
  const csv = (h, rows, m) => h.join(",") + "\n" + rows.map(r =>
    m(r).map(v => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")).join("\n");
  const files = [
    { name: "logs_all.csv", data: csv(
        ["id","ts","level","source","message","meta","ref_id"], all,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.level, r.source, r.message, r.meta, r.ref_id]) },
    { name: "logs_errors.csv", data: csv(
        ["id","ts","source","message","meta","ref_id"], errors,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.source, r.message, r.meta, r.ref_id]) },
    { name: "audit.csv", data: csv(
        ["id","ts","actor_type","actor_id","actor_name","action","target","ip","meta"], audit,
        (r) => [r.id, new Date(r.ts*1000).toISOString(), r.actor_type, r.actor_id, r.actor_name, r.action, r.target, r.ip, r.meta]) },
    { name: "stats.json", data: JSON.stringify(_logStats(), null, 2) },
  ];
  const zip = buildZip(files);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="logs_${Date.now()}.zip"`);
  res.end(zip);
});

module.exports = router;
