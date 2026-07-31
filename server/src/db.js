const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = (process.env.DATA_DIR || "").trim() || path.join(__dirname, "..", "..");
try { require("fs").mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "shop.db");
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  tg_id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, last_name TEXT,
  lang TEXT DEFAULT 'uz',
  country_id INTEGER,
  phone TEXT,
  blocked INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name_uz TEXT, name_ru TEXT, name_en TEXT, name_kk TEXT, name_tr TEXT, name_tg TEXT,
  icon TEXT,
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name_uz TEXT, name_ru TEXT, name_en TEXT, name_kk TEXT, name_tr TEXT, name_tg TEXT,
  desc_uz TEXT, desc_ru TEXT, desc_en TEXT, desc_kk TEXT, desc_tr TEXT, desc_tg TEXT,
  price INTEGER NOT NULL,
  old_price INTEGER,
  brand TEXT,
  colors TEXT DEFAULT '',
  sizes TEXT DEFAULT '',
  stock INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  sort INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_uz TEXT, name_ru TEXT, name_en TEXT, name_kk TEXT, name_tr TEXT, name_tg TEXT,
  flag TEXT,
  currency TEXT DEFAULT 'UZS',
  shipping_price INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image TEXT NOT NULL,
  link TEXT,
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  size TEXT,
  color TEXT,
  qty INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT, phone TEXT, address TEXT,
  country_id INTEGER, city TEXT,
  items_json TEXT NOT NULL,
  subtotal INTEGER, shipping INTEGER, discount INTEGER DEFAULT 0, total INTEGER,
  payment TEXT DEFAULT 'cash',
  promo TEXT,
  status TEXT DEFAULT 'new',
  note TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER NOT NULL,
  active INTEGER DEFAULT 1,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS translations (
  key TEXT NOT NULL,
  lang TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  comment TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_images_prod ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
`);

try {
  db.exec(`DELETE FROM cart_items WHERE id NOT IN (
    SELECT MIN(id) FROM cart_items GROUP BY user_id, product_id, IFNULL(size,''), IFNULL(color,'')
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_line
    ON cart_items(user_id, product_id, IFNULL(size,''), IFNULL(color,''))`);
} catch (e) {
  console.warn("cart index:", e.message);
}

// -------- Migratsiyalar (eski bazalar uchun xavfsiz) --------
function addColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
addColumn("orders", "currency", "TEXT");
addColumn("orders", "paid", "INTEGER DEFAULT 0");
addColumn("orders", "receipt", "TEXT");
addColumn("users", "last_seen", "INTEGER");
addColumn("users", "lang_set", "INTEGER DEFAULT 0");
addColumn("users", "photo_url", "TEXT");
addColumn("users", "photo_file_id", "TEXT");
addColumn("product_images", "file_id", "TEXT");
addColumn("products", "sold", "INTEGER DEFAULT 0");
addColumn("countries", "free_from", "INTEGER DEFAULT 0");
addColumn("promo_codes", "min_total", "INTEGER DEFAULT 0");
addColumn("promo_codes", "max_uses", "INTEGER DEFAULT 0");
addColumn("promo_codes", "used", "INTEGER DEFAULT 0");

// -------- SEED (only if empty) --------
function seed() {
  const catCount = db.prepare("SELECT COUNT(*) c FROM categories").get().c;
  if (catCount === 0) {
    const ins = db.prepare(`INSERT INTO categories
      (name_uz,name_ru,name_en,name_kk,name_tr,name_tg,icon,sort)
      VALUES (?,?,?,?,?,?,?,?)`);
    ins.run("Erkaklar","Мужское","Men","Ерлерге","Erkek","Мардона","👔",1);
    ins.run("Ayollar","Женское","Women","Әйелдерге","Kadın","Занона","👗",2);
    ins.run("Bolalar","Детское","Kids","Балаларға","Çocuk","Кӯдакона","👶",3);
    ins.run("Poyabzal","Обувь","Shoes","Аяқ киім","Ayakkabı","Пойафзол","👟",4);
    ins.run("Aksessuarlar","Аксессуары","Accessories","Аксессуарлар","Aksesuar","Аксессуарҳо","👜",5);
  }
  const ctrCount = db.prepare("SELECT COUNT(*) c FROM countries").get().c;
  if (ctrCount === 0) {
    const ins = db.prepare(`INSERT INTO countries
      (code,name_uz,name_ru,name_en,name_kk,name_tr,name_tg,flag,currency,shipping_price)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    ins.run("UZ","O'zbekiston","Узбекистан","Uzbekistan","Өзбекстан","Özbekistan","Ӯзбекистон","🇺🇿","UZS",25000);
    ins.run("RU","Rossiya","Россия","Russia","Ресей","Rusya","Русия","🇷🇺","RUB",500);
    ins.run("KZ","Qozog'iston","Казахстан","Kazakhstan","Қазақстан","Kazakistan","Қазоқистон","🇰🇿","KZT",2500);
    ins.run("TR","Turkiya","Турция","Turkey","Түркия","Türkiye","Туркия","🇹🇷","TRY",150);
    ins.run("TJ","Tojikiston","Таджикистан","Tajikistan","Тәжікстан","Tacikistan","Тоҷикистон","🇹🇯","TJS",50);
  }
}
seed();

// -------- Admin bootstrap (from .env) --------
const DEFAULT_SETTINGS = {
  shop_name: process.env.SHOP_NAME || "Shop",
  currency: process.env.CURRENCY || "UZS",
  support_phone: process.env.SUPPORT_PHONE || "+998 95 390 94 77",
  support_username: "",
  about: "",
  free_shipping_from: "0",
  payment_methods: JSON.stringify(["cash", "card", "click", "payme"]),
  card_number: "",
  card_holder: "",
  min_order_total: "0",
  daily_report_enabled: "0",
  daily_report_hour: "9",
};

function ensureSettings() {
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, String(v));
  // Eski placeholder raqamni haqiqiy qo'llab-quvvatlash raqamiga almashtiramiz
  db.prepare("UPDATE settings SET value=? WHERE key='support_phone' AND (value='' OR value='+998 90 000 00 00')")
    .run(DEFAULT_SETTINGS.support_phone);
}

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function saveSettings(obj) {
  const set = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      set.run(k, v === null || v === undefined ? "" : String(v));
    }
  });
  tx(Object.entries(obj || {}));
  return getSettings();
}

// -------- Helpers --------
const q = {
  // Users
  upsertUser: db.prepare(`INSERT INTO users (tg_id, username, first_name, last_name)
    VALUES (?,?,?,?)
    ON CONFLICT(tg_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name`),
  getUser: db.prepare("SELECT * FROM users WHERE tg_id = ?"),
  setLang: db.prepare("UPDATE users SET lang = ? WHERE tg_id = ?"),
  setCountry: db.prepare("UPDATE users SET country_id = ? WHERE tg_id = ?"),
  setPhone: db.prepare("UPDATE users SET phone = ? WHERE tg_id = ?"),
  setBlocked: db.prepare("UPDATE users SET blocked = ? WHERE tg_id = ?"),
  listUsers: db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 500"),
  allUserIds: db.prepare("SELECT tg_id FROM users WHERE blocked = 0"),
  countUsers: db.prepare("SELECT COUNT(*) c FROM users"),

  // Categories
  addCat: db.prepare(`INSERT INTO categories (parent_id,name_uz,name_ru,name_en,name_kk,name_tr,name_tg,icon,sort)
    VALUES (?,?,?,?,?,?,?,?,?)`),
  updCat: db.prepare(`UPDATE categories SET parent_id=?, name_uz=?, name_ru=?, name_en=?, name_kk=?, name_tr=?, name_tg=?, icon=?, sort=?, active=? WHERE id=?`),
  delCat: db.prepare("DELETE FROM categories WHERE id=?"),
  listCats: db.prepare("SELECT * FROM categories ORDER BY sort, id"),
  getCat: db.prepare("SELECT * FROM categories WHERE id = ?"),

  // Products
  addProd: db.prepare(`INSERT INTO products
    (category_id,name_uz,name_ru,name_en,name_kk,name_tr,name_tg,
     desc_uz,desc_ru,desc_en,desc_kk,desc_tr,desc_tg,
     price,old_price,brand,colors,sizes,stock,active,featured)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  updProd: db.prepare(`UPDATE products SET
    category_id=?, name_uz=?, name_ru=?, name_en=?, name_kk=?, name_tr=?, name_tg=?,
    desc_uz=?, desc_ru=?, desc_en=?, desc_kk=?, desc_tr=?, desc_tg=?,
    price=?, old_price=?, brand=?, colors=?, sizes=?, stock=?, active=?, featured=?
    WHERE id=?`),
  delProd: db.prepare("DELETE FROM products WHERE id=?"),
  listProds: db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC"),
  listAllProds: db.prepare("SELECT * FROM products ORDER BY id DESC"),
  featProds: db.prepare("SELECT * FROM products WHERE active=1 AND featured=1 ORDER BY id DESC LIMIT 20"),
  prodsByCat: db.prepare("SELECT * FROM products WHERE active=1 AND category_id=? ORDER BY id DESC"),
  getProd: db.prepare("SELECT * FROM products WHERE id=?"),
  searchProds: db.prepare(`SELECT * FROM products WHERE active=1 AND
    (name_uz LIKE ? OR name_ru LIKE ? OR name_en LIKE ? OR brand LIKE ?)
    ORDER BY id DESC LIMIT 50`),
  countProds: db.prepare("SELECT COUNT(*) c FROM products"),

  // Product images
  addImg: db.prepare("INSERT INTO product_images (product_id, url, sort) VALUES (?,?,?)"),
  addImgFull: db.prepare("INSERT INTO product_images (product_id, url, sort, file_id) VALUES (?,?,?,?)"),
  setImgFileId: db.prepare("UPDATE product_images SET file_id=? WHERE id=?"),
  delImgsForProd: db.prepare("DELETE FROM product_images WHERE product_id=?"),
  imgsForProd: db.prepare("SELECT * FROM product_images WHERE product_id=? ORDER BY sort, id"),

  // Countries
  addCountry: db.prepare(`INSERT INTO countries (code,name_uz,name_ru,name_en,name_kk,name_tr,name_tg,flag,currency,shipping_price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`),
  updCountry: db.prepare(`UPDATE countries SET code=?, name_uz=?, name_ru=?, name_en=?, name_kk=?, name_tr=?, name_tg=?, flag=?, currency=?, shipping_price=?, active=? WHERE id=?`),
  delCountry: db.prepare("DELETE FROM countries WHERE id=?"),
  listCountries: db.prepare("SELECT * FROM countries WHERE active=1 ORDER BY id"),
  listAllCountries: db.prepare("SELECT * FROM countries ORDER BY id"),
  getCountry: db.prepare("SELECT * FROM countries WHERE id=?"),

  // Banners
  addBanner: db.prepare("INSERT INTO banners (image, link, sort) VALUES (?,?,?)"),
  delBanner: db.prepare("DELETE FROM banners WHERE id=?"),
  listBanners: db.prepare("SELECT * FROM banners WHERE active=1 ORDER BY sort, id"),
  listAllBanners: db.prepare("SELECT * FROM banners ORDER BY sort, id"),

  // Cart
  addCartItem: db.prepare(`INSERT INTO cart_items (user_id,product_id,size,color,qty) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, product_id, IFNULL(size,''), IFNULL(color,''))
    DO UPDATE SET qty = MIN(qty + excluded.qty, 99)`),
  getCart: db.prepare(`SELECT c.*, p.name_uz,p.name_ru,p.name_en,p.name_kk,p.name_tr,p.name_tg, p.price
    FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.id`),
  updateCartQty: db.prepare("UPDATE cart_items SET qty=? WHERE id=? AND user_id=?"),
  delCartItem: db.prepare("DELETE FROM cart_items WHERE id=? AND user_id=?"),
  clearCart: db.prepare("DELETE FROM cart_items WHERE user_id=?"),

  // Favorites
  addFav: db.prepare("INSERT OR IGNORE INTO favorites (user_id,product_id) VALUES (?,?)"),
  delFav: db.prepare("DELETE FROM favorites WHERE user_id=? AND product_id=?"),
  isFav: db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND product_id=?"),
  listFavs: db.prepare(`SELECT p.* FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=?`),

  // Orders
  addOrder: db.prepare(`INSERT INTO orders
    (user_id,name,phone,address,country_id,city,items_json,subtotal,shipping,discount,total,payment,promo,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  userOrders: db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100"),
  allOrders: db.prepare("SELECT o.*, u.username, u.first_name FROM orders o LEFT JOIN users u ON u.tg_id=o.user_id ORDER BY o.id DESC LIMIT 500"),
  getOrder: db.prepare("SELECT * FROM orders WHERE id=?"),
  setOrderStatus: db.prepare("UPDATE orders SET status=? WHERE id=?"),
  countOrders: db.prepare("SELECT COUNT(*) c FROM orders"),
  revenueSum: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled'"),
  revenueByDay: db.prepare(`SELECT date(created_at,'unixepoch') d, SUM(total) s, COUNT(*) c
    FROM orders WHERE status != 'cancelled' GROUP BY d ORDER BY d DESC LIMIT 30`),

  // Promo
  addPromo: db.prepare("INSERT INTO promo_codes (code, percent, active, expires_at) VALUES (?,?,?,?)"),
  delPromo: db.prepare("DELETE FROM promo_codes WHERE id=?"),
  listPromos: db.prepare("SELECT * FROM promo_codes ORDER BY id DESC"),
  getPromo: db.prepare("SELECT * FROM promo_codes WHERE code=? AND active=1 AND (expires_at IS NULL OR expires_at > strftime('%s','now'))"),

  // Translations
  setT: db.prepare("INSERT OR REPLACE INTO translations (key,lang,value) VALUES (?,?,?)"),
  getT: db.prepare("SELECT * FROM translations WHERE lang=?"),
  allT: db.prepare("SELECT * FROM translations ORDER BY key,lang"),

  // Stock / sales
  decStock: db.prepare("UPDATE products SET stock = MAX(stock - ?, 0), sold = COALESCE(sold,0) + ? WHERE id = ?"),
  incStock: db.prepare("UPDATE products SET stock = stock + ?, sold = MAX(COALESCE(sold,0) - ?, 0) WHERE id = ?"),
  topProducts: db.prepare("SELECT id, name_uz, name_ru, price, COALESCE(sold,0) sold FROM products ORDER BY COALESCE(sold,0) DESC LIMIT 10"),

  // Order events
  addEvent: db.prepare("INSERT INTO order_events (order_id, status, comment) VALUES (?,?,?)"),
  orderEvents: db.prepare("SELECT * FROM order_events WHERE order_id=? ORDER BY id"),
  setOrderPaid: db.prepare("UPDATE orders SET paid=? WHERE id=?"),
  cancelOwnOrder: db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('new','pending')"),
  ordersByStatus: db.prepare("SELECT COUNT(*) c FROM orders WHERE status=?"),

  // Promo usage
  usePromo: db.prepare("UPDATE promo_codes SET used = COALESCE(used,0) + 1 WHERE id = ?"),
  updPromo: db.prepare("UPDATE promo_codes SET code=?, percent=?, active=?, expires_at=?, min_total=?, max_uses=? WHERE id=?"),

  // Aliases (eski nomlar bilan moslik)
  countProducts: db.prepare("SELECT COUNT(*) c FROM products"),
  setLangSet: db.prepare("UPDATE users SET lang_set = 1 WHERE tg_id = ?"),
  setPhotoUrl: db.prepare("UPDATE users SET photo_url = ? WHERE tg_id = ?"),
  setPhotoFileId: db.prepare("UPDATE users SET photo_file_id = ? WHERE tg_id = ?"),
  countUserOrders: db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=?"),
  countUserFavs: db.prepare("SELECT COUNT(*) c FROM favorites WHERE user_id=?"),
  countUserCart: db.prepare("SELECT COALESCE(SUM(qty),0) c FROM cart_items WHERE user_id=?"),
  sumUserSpent: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE user_id=? AND status != 'cancelled'"),
  markSeen: db.prepare("UPDATE users SET last_seen = strftime('%s','now') WHERE tg_id = ?"),
};

ensureSettings();

module.exports = { db, q, getSettings, saveSettings, DEFAULT_SETTINGS, DB_FILE };
