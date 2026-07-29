// Mini App — Preact + htm (no build)
import { h, render } from "https://esm.sh/preact@10.22.0";
import { useState, useEffect, useMemo, useCallback } from "https://esm.sh/preact@10.22.0/hooks";
import htm from "https://esm.sh/htm@3.1.1";
const html = htm.bind(h);

const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();

// i18n
const T = {
  uz:{home:"Bosh sahifa",catalog:"Katalog",cart:"Savat",profile:"Profil",search:"Qidirish...",price:"Narx",sizes:"O'lchamlar",colors:"Ranglar",add_to_cart:"Savatga qo'shish",added:"Savatga qo'shildi",featured:"Tavsiyalar",latest:"Yangi",categories:"Kategoriyalar",empty_cart:"Savat bo'sh",total:"Jami",subtotal:"Mahsulotlar",shipping:"Yetkazib berish",discount:"Chegirma",checkout:"Buyurtma berish",name:"Ismingiz",phone:"Telefon",address:"Manzil",city:"Shahar",country:"Davlat",payment:"To'lov usuli",cash:"Naqd (yetkazib berganda)",card:"Karta (operator tasdiqi)",promo:"Promo-kod",apply:"Qo'llash",order_sent:"✅ Buyurtmangiz qabul qilindi!",my_orders:"Buyurtmalarim",no_orders:"Hozircha buyurtmalar yo'q",change_lang:"Tilni o'zgartirish",favorites:"Sevimlilar",filter:"Filtr",sort:"Saralash",sort_new:"Yangilar",sort_price_asc:"Arzon → Qimmat",sort_price_desc:"Qimmat → Arzon",back:"Ortga",qty:"Miqdor",note:"Izoh (ixtiyoriy)",fav_add:"Sevimlilarga",fav_remove:"Sevimlilardan olib tashlash",status:{new:"Yangi",paid:"To'landi",packing:"Qadoqlanmoqda",shipping:"Yuborildi",delivered:"Yetkazildi",cancelled:"Bekor qilindi"}},
  ru:{home:"Главная",catalog:"Каталог",cart:"Корзина",profile:"Профиль",search:"Поиск...",price:"Цена",sizes:"Размеры",colors:"Цвета",add_to_cart:"В корзину",added:"Добавлено",featured:"Рекомендуем",latest:"Новинки",categories:"Категории",empty_cart:"Корзина пуста",total:"Итого",subtotal:"Товары",shipping:"Доставка",discount:"Скидка",checkout:"Оформить заказ",name:"Имя",phone:"Телефон",address:"Адрес",city:"Город",country:"Страна",payment:"Оплата",cash:"Наличные (при доставке)",card:"Карта (уточнит оператор)",promo:"Промокод",apply:"Применить",order_sent:"✅ Заказ принят!",my_orders:"Мои заказы",no_orders:"Заказов пока нет",change_lang:"Сменить язык",favorites:"Избранное",filter:"Фильтр",sort:"Сортировка",sort_new:"Новые",sort_price_asc:"Дешевле",sort_price_desc:"Дороже",back:"Назад",qty:"Кол-во",note:"Комментарий",fav_add:"В избранное",fav_remove:"Убрать",status:{new:"Новый",paid:"Оплачен",packing:"Упаковка",shipping:"Отправлен",delivered:"Доставлен",cancelled:"Отменён"}},
  en:{home:"Home",catalog:"Catalog",cart:"Cart",profile:"Profile",search:"Search...",price:"Price",sizes:"Sizes",colors:"Colors",add_to_cart:"Add to cart",added:"Added",featured:"Featured",latest:"New",categories:"Categories",empty_cart:"Cart is empty",total:"Total",subtotal:"Subtotal",shipping:"Shipping",discount:"Discount",checkout:"Checkout",name:"Name",phone:"Phone",address:"Address",city:"City",country:"Country",payment:"Payment",cash:"Cash on delivery",card:"Card (operator will confirm)",promo:"Promo code",apply:"Apply",order_sent:"✅ Order placed!",my_orders:"My orders",no_orders:"No orders yet",change_lang:"Change language",favorites:"Favorites",filter:"Filter",sort:"Sort",sort_new:"New",sort_price_asc:"Cheap → Expensive",sort_price_desc:"Expensive → Cheap",back:"Back",qty:"Qty",note:"Note",fav_add:"Favorite",fav_remove:"Unfavorite",status:{new:"New",paid:"Paid",packing:"Packing",shipping:"Shipped",delivered:"Delivered",cancelled:"Cancelled"}},
  kk:{home:"Басты",catalog:"Каталог",cart:"Себет",profile:"Профиль",search:"Іздеу...",price:"Бағасы",sizes:"Өлшемдер",colors:"Түстер",add_to_cart:"Себетке",added:"Қосылды",featured:"Ұсынылады",latest:"Жаңа",categories:"Санаттар",empty_cart:"Себет бос",total:"Барлығы",subtotal:"Тауарлар",shipping:"Жеткізу",discount:"Жеңілдік",checkout:"Тапсырыс",name:"Аты",phone:"Телефон",address:"Мекенжай",city:"Қала",country:"Ел",payment:"Төлем",cash:"Қолма-қол",card:"Карта",promo:"Промокод",apply:"Қолдану",order_sent:"✅ Қабылданды!",my_orders:"Тапсырыстар",no_orders:"Жоқ",change_lang:"Тілді өзгерту",favorites:"Таңдаулы",filter:"Сүзгі",sort:"Сұрыптау",sort_new:"Жаңа",sort_price_asc:"Арзан",sort_price_desc:"Қымбат",back:"Артқа",qty:"Саны",note:"Ескерту",fav_add:"Таңдау",fav_remove:"Алып тастау",status:{new:"Жаңа",paid:"Төленді",packing:"Дайын",shipping:"Жіберілді",delivered:"Жеткізілді",cancelled:"Тоқтатылды"}},
  tr:{home:"Anasayfa",catalog:"Katalog",cart:"Sepet",profile:"Profil",search:"Ara...",price:"Fiyat",sizes:"Bedenler",colors:"Renkler",add_to_cart:"Sepete ekle",added:"Eklendi",featured:"Öne çıkan",latest:"Yeni",categories:"Kategoriler",empty_cart:"Sepet boş",total:"Toplam",subtotal:"Ürünler",shipping:"Kargo",discount:"İndirim",checkout:"Sipariş",name:"Ad",phone:"Telefon",address:"Adres",city:"Şehir",country:"Ülke",payment:"Ödeme",cash:"Kapıda nakit",card:"Kart",promo:"Kupon",apply:"Uygula",order_sent:"✅ Sipariş alındı!",my_orders:"Siparişlerim",no_orders:"Sipariş yok",change_lang:"Dili değiştir",favorites:"Favoriler",filter:"Filtre",sort:"Sırala",sort_new:"Yeni",sort_price_asc:"Ucuz",sort_price_desc:"Pahalı",back:"Geri",qty:"Adet",note:"Not",fav_add:"Favori",fav_remove:"Kaldır",status:{new:"Yeni",paid:"Ödendi",packing:"Paketleniyor",shipping:"Kargoda",delivered:"Teslim",cancelled:"İptal"}},
  tg:{home:"Асосӣ",catalog:"Каталог",cart:"Сабад",profile:"Профил",search:"Ҷустуҷӯ...",price:"Нарх",sizes:"Андозаҳо",colors:"Рангҳо",add_to_cart:"Ба сабад",added:"Илова шуд",featured:"Тавсия",latest:"Нав",categories:"Категория",empty_cart:"Сабад холист",total:"Ҳамагӣ",subtotal:"Молҳо",shipping:"Расонидан",discount:"Тахфиф",checkout:"Фармоиш",name:"Ном",phone:"Телефон",address:"Суроға",city:"Шаҳр",country:"Кишвар",payment:"Пардохт",cash:"Нақд",card:"Корт",promo:"Промокод",apply:"Истифода",order_sent:"✅ Қабул шуд!",my_orders:"Фармоишҳо",no_orders:"Нест",change_lang:"Забон",favorites:"Дӯстдоштаҳо",filter:"Филтр",sort:"Мураттаб",sort_new:"Нав",sort_price_asc:"Арзон",sort_price_desc:"Қимат",back:"Бозгашт",qty:"Миқдор",note:"Эзоҳ",fav_add:"Дӯстдошта",fav_remove:"Хориҷ",status:{new:"Нав",paid:"Пардохт",packing:"Тайёр",shipping:"Фиристода",delivered:"Расонида",cancelled:"Бекор"}},
};
const LANG_NAMES = {uz:"🇺🇿 O'zbek",ru:"🇷🇺 Русский",en:"🇬🇧 English",kk:"🇰🇿 Қазақша",tr:"🇹🇷 Türkçe",tg:"🇹🇯 Тоҷикӣ"};

// Qo'shimcha matnlar (asosiy T bloki ustiga qo'shiladi)
const EXTRA = {
  uz:{out_of_stock:"Omborda yo'q",left:"qoldi",cancel_order:"Buyurtmani bekor qilish",cancel_confirm:"Buyurtma bekor qilinsinmi?",cancelled_ok:"Buyurtma bekor qilindi",loading:"Yuklanmoqda...",err:"Xatolik yuz berdi",nothing:"Hech narsa topilmadi",free:"Bepul",free_from:"{sum} dan yuqori xaridga yetkazish bepul",min_order:"Minimal buyurtma: {sum}",required:"Iltimos, majburiy maydonlarni to'ldiring",card_info:"Karta raqami",details:"Batafsil",history:"Holatlar tarixi",support:"Qo'llab-quvvatlash",remove:"O'chirish",clear:"Tozalash",transfer:"Bank o'tkazmasi",click:"Click",payme:"Payme",stock_left:"Omborda {n} dona"},
  ru:{out_of_stock:"Нет в наличии",left:"осталось",cancel_order:"Отменить заказ",cancel_confirm:"Отменить заказ?",cancelled_ok:"Заказ отменён",loading:"Загрузка...",err:"Произошла ошибка",nothing:"Ничего не найдено",free:"Бесплатно",free_from:"Доставка бесплатна от {sum}",min_order:"Минимальный заказ: {sum}",required:"Заполните обязательные поля",card_info:"Номер карты",details:"Подробнее",history:"История статусов",support:"Поддержка",remove:"Удалить",clear:"Очистить",transfer:"Банковский перевод",click:"Click",payme:"Payme",stock_left:"На складе {n} шт"},
  en:{out_of_stock:"Out of stock",left:"left",cancel_order:"Cancel order",cancel_confirm:"Cancel this order?",cancelled_ok:"Order cancelled",loading:"Loading...",err:"Something went wrong",nothing:"Nothing found",free:"Free",free_from:"Free shipping from {sum}",min_order:"Minimum order: {sum}",required:"Please fill required fields",card_info:"Card number",details:"Details",history:"Status history",support:"Support",remove:"Remove",clear:"Clear",transfer:"Bank transfer",click:"Click",payme:"Payme",stock_left:"{n} in stock"},
};
EXTRA.kk = EXTRA.ru; EXTRA.tg = EXTRA.ru; EXTRA.tr = EXTRA.en;
for (const k of Object.keys(T)) T[k] = { ...(EXTRA[k] || EXTRA.uz), ...T[k] };

function getLang() {
  const p = new URLSearchParams(location.search);
  return localStorage.getItem("lang") || p.get("lang") || tg?.initDataUnsafe?.user?.language_code?.slice(0, 2) || "uz";
}

/* ------------------------------ API ------------------------------ */
const initData = tg?.initData || "";
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.details?.join(", ") || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const fmt = (n) => (Number(n) || 0).toLocaleString("ru-RU");
const nameOf = (o, lang, base = "name") => o?.[`${base}_${lang}`] || o?.[`${base}_uz`] || o?.[`${base}_ru`] || "";
const listOf = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const haptic = (type = "light") => tg?.HapticFeedback?.impactOccurred?.(type);

let toastFn = () => {};
const toast = (msg, kind = "info") => toastFn(msg, kind);

/* ---------------------------- Router ---------------------------- */
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (to) => { location.hash = to; }];
}

/* --------------------------- UI parts --------------------------- */
function Toast({ items }) {
  return html`<div class="toast-wrap">
    ${items.map((t) => html`<div key=${t.id} class="toast ${t.kind}">${t.msg}</div>`)}
  </div>`;
}

function TopBar({ title, onBack, right }) {
  return html`
    <div class="topbar">
      ${onBack && html`<button aria-label="back" onClick=${() => { haptic(); onBack(); }} class="icon-btn">‹</button>`}
      <h1 class="text-[17px] font-semibold flex-1 truncate">${title}</h1>
      ${right}
    </div>`;
}

function Skeleton({ h = 180, cls = "" }) {
  return html`<div class="skel ${cls}" style="height:${h}px"></div>`;
}

function GridSkeleton({ n = 4 }) {
  return html`<div class="grid grid-cols-2 gap-3 p-4">
    ${Array.from({ length: n }).map((_, i) => html`<${Skeleton} key=${i} h=${230} cls="rounded-2xl"/>`)}
  </div>`;
}

function Empty({ icon = "🔍", text }) {
  return html`<div class="flex flex-col items-center justify-center py-20 gap-2 opacity-60">
    <div class="text-5xl">${icon}</div><div class="text-sm">${text}</div></div>`;
}

function BottomNav({ route, go, cartCount, lang }) {
  const t = T[lang];
  const items = [["home", "🏠", t.home, "/"], ["cat", "🛍", t.catalog, "/catalog"], ["cart", "🛒", t.cart, "/cart"], ["prof", "👤", t.profile, "/profile"]];
  return html`
    <nav class="bottomnav">
      ${items.map(([k, ic, label, to]) => {
        const active = route === to || (to !== "/" && route.startsWith(to));
        return html`
        <button key=${k} onClick=${() => { haptic(); go(to); }}
          class="navbtn ${active ? "navbtn-on" : ""}">
          <span class="text-[21px] leading-none">${ic}</span>
          <span class="text-[10px] mt-0.5">${label}</span>
          ${k === "cart" && cartCount > 0 && html`<span class="badge">${cartCount}</span>`}
        </button>`;
      })}
    </nav>`;
}

function ProductCard({ p, lang, go, cur }) {
  const t = T[lang];
  const img = p.images?.[0] || "";
  const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const soldOut = p.stock !== undefined && p.stock <= 0;
  return html`
    <div class="pcard fadein" onClick=${() => { haptic(); go(`/product/${p.id}`); }}>
      <div class="pcard-img">
        ${img ? html`<img src=${img} alt=${nameOf(p, lang)} loading="lazy"/>` : html`<div class="ph">👕</div>`}
        ${off > 0 && html`<span class="tag-sale">-${off}%</span>`}
        ${soldOut && html`<div class="soldout">${t.out_of_stock}</div>`}
      </div>
      <div class="p-2.5">
        <div class="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.4em]">${nameOf(p, lang)}</div>
        <div class="flex items-baseline gap-1.5 mt-1.5">
          <span class="font-bold text-[15px]">${fmt(p.price)}</span>
          <span class="text-[11px] opacity-60">${cur}</span>
          ${p.old_price > p.price ? html`<span class="text-[11px] line-through opacity-40">${fmt(p.old_price)}</span>` : null}
        </div>
      </div>
    </div>`;
}

/* ----------------------------- Pages ----------------------------- */
function HomePage({ lang, go, home, config }) {
  const t = T[lang];
  const [bi, setBi] = useState(0);
  const banners = home?.banners || [];
  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(() => setBi((i) => (i + 1) % banners.length), 4500);
    return () => clearInterval(id);
  }, [banners.length]);
  const cur = config?.currency || "";

  if (!home) return html`<div class="pb-24"><div class="p-4"><${Skeleton} h=${170} cls="rounded-2xl"/></div><${GridSkeleton}/></div>`;

  return html`
    <div class="pb-24">
      <div class="px-4 pt-4 flex items-center justify-between">
        <div class="text-[22px] font-bold tracking-tight">${config?.shop_name || "Shop"}</div>
        <button class="icon-btn" onClick=${() => go("/favorites")}>❤️</button>
      </div>

      ${banners.length > 0 && html`
        <div class="px-4 pt-3">
          <div class="banner">
            ${banners.map((b, i) => html`<img key=${b.id} src=${b.image} alt="" style="opacity:${i === bi ? 1 : 0}"/>`)}
            ${banners.length > 1 && html`<div class="dots">
              ${banners.map((_, i) => html`<span class=${i === bi ? "dot on" : "dot"}></span>`)}
            </div>`}
          </div>
        </div>`}

      <div class="px-4 pt-4">
        <button class="searchbar" onClick=${() => go("/catalog")}>
          <span>🔎</span><span class="flex-1 text-left text-sm opacity-55">${t.search}</span>
        </button>
      </div>

      ${config?.free_shipping_from > 0 && html`
        <div class="px-4 pt-3">
          <div class="notice">🚚 ${t.free_from.replace("{sum}", `${fmt(config.free_shipping_from)} ${cur}`)}</div>
        </div>`}

      ${home.categories?.length > 0 && html`
        <div class="pt-5">
          <div class="section-title px-4">${t.categories}</div>
          <div class="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
            ${home.categories.map((c) => html`
              <button key=${c.id} onClick=${() => go(`/catalog?cat=${c.id}`)} class="cat-chip">
                <span class="cat-ico">${c.icon || "👕"}</span>
                <span class="text-[11px] text-center line-clamp-1 w-full">${nameOf(c, lang)}</span>
              </button>`)}
          </div>
        </div>`}

      ${home.featured?.length > 0 && html`
        <div class="pt-5">
          <div class="section-title px-4">⭐ ${t.featured}</div>
          <div class="grid grid-cols-2 gap-3 px-4">
            ${home.featured.map((p) => html`<${ProductCard} key=${p.id} p=${p} lang=${lang} go=${go} cur=${cur}/>`)}
          </div>
        </div>`}

      <div class="pt-5">
        <div class="section-title px-4">🆕 ${t.latest}</div>
        ${home.latest?.length ? html`
          <div class="grid grid-cols-2 gap-3 px-4">
            ${home.latest.map((p) => html`<${ProductCard} key=${p.id} p=${p} lang=${lang} go=${go} cur=${cur}/>`)}
          </div>` : html`<${Empty} icon="📦" text=${t.nothing}/>`}
      </div>
    </div>`;
}

function CatalogPage({ lang, go, params, config }) {
  const t = T[lang];
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState(params.get("cat") || "");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("");
  const cur = config?.currency || "";

  useEffect(() => { api("/categories").then(setCats).catch(() => {}); }, []);
  useEffect(() => { const id = setTimeout(() => setDebounced(term), 350); return () => clearTimeout(id); }, [term]);
  useEffect(() => {
    let alive = true;
    setItems(null);
    const qp = new URLSearchParams();
    if (cat) qp.set("category", cat);
    if (debounced) qp.set("q", debounced);
    if (sort) qp.set("sort", sort);
    api(`/products?${qp}`).then((r) => alive && setItems(r)).catch((e) => { toast(e.message, "err"); alive && setItems([]); });
    return () => { alive = false; };
  }, [cat, debounced, sort]);

  return html`
    <div class="pb-24">
      <${TopBar} title=${t.catalog}/>
      <div class="px-4 pt-2">
        <div class="searchbar">
          <span>🔎</span>
          <input value=${term} onInput=${(e) => setTerm(e.target.value)} placeholder=${t.search} class="flex-1 bg-transparent outline-none text-sm"/>
          ${term && html`<button onClick=${() => setTerm("")} class="opacity-50">✕</button>`}
        </div>
      </div>
      <div class="flex gap-2 overflow-x-auto no-scrollbar px-4 pt-3">
        <button onClick=${() => setCat("")} class=${!cat ? "chip chip-on" : "chip"}>${t.filter === "Filtr" ? "Hammasi" : "All"}</button>
        ${cats.map((c) => html`
          <button key=${c.id} onClick=${() => setCat(String(c.id))} class=${String(cat) === String(c.id) ? "chip chip-on" : "chip"}>
            ${c.icon || ""} ${nameOf(c, lang)}
          </button>`)}
      </div>
      <div class="px-4 pt-3">
        <select value=${sort} onChange=${(e) => setSort(e.target.value)} class="chip">
          <option value="">${t.sort_new}</option>
          <option value="price_asc">${t.sort_price_asc}</option>
          <option value="price_desc">${t.sort_price_desc}</option>
        </select>
      </div>
      ${items === null ? html`<${GridSkeleton} n=${6}/>` : items.length === 0
        ? html`<${Empty} text=${t.nothing}/>`
        : html`<div class="grid grid-cols-2 gap-3 p-4">
            ${items.map((p) => html`<${ProductCard} key=${p.id} p=${p} lang=${lang} go=${go} cur=${cur}/>`)}
          </div>`}
    </div>`;
}

function ProductPage({ lang, go, id, refreshCart, config, favIds, toggleFav }) {
  const t = T[lang];
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [imgIdx, setImgIdx] = useState(0);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const cur = config?.currency || "";

  useEffect(() => {
    api(`/products/${id}`).then((r) => {
      setP(r);
      setSize(listOf(r.sizes)[0] || "");
      setColor(listOf(r.colors)[0] || "");
    }).catch((e) => setErr(e.message));
  }, [id]);

  const add = async () => {
    setAdding(true);
    try {
      await api("/cart/add", { method: "POST", body: { product_id: Number(id), size, color, qty } });
      tg?.HapticFeedback?.notificationOccurred("success");
      toast(t.added, "ok");
      refreshCart();
    } catch (e) { toast(e.message, "err"); }
    setAdding(false);
  };

  if (err) return html`<div><${TopBar} title="" onBack=${() => history.back()}/><${Empty} icon="⚠️" text=${err}/></div>`;
  if (!p) return html`<div><${TopBar} title=${t.loading} onBack=${() => history.back()}/><div class="p-4"><${Skeleton} h=${380} cls="rounded-2xl"/></div></div>`;

  const images = p.images?.length ? p.images : [];
  const sizes = listOf(p.sizes);
  const colors = listOf(p.colors);
  const soldOut = p.stock <= 0;
  const fav = favIds.has(p.id);

  return html`
    <div class="pb-32">
      <${TopBar} title=${nameOf(p, lang)} onBack=${() => history.back()}/>
      <div class="relative">
        <div class="hero-img">
          ${images.length ? html`<img src=${images[imgIdx]} alt=${nameOf(p, lang)}/>` : html`<div class="ph text-6xl">👕</div>`}
        </div>
        <button onClick=${async () => { haptic(); toggleFav(p.id); }} class="fav-btn">${fav ? "❤️" : "🤍"}</button>
        ${images.length > 1 && html`
          <div class="flex gap-2 justify-center py-2 px-4 overflow-x-auto no-scrollbar">
            ${images.map((im, i) => html`
              <button key=${i} onClick=${() => setImgIdx(i)} class=${i === imgIdx ? "thumb thumb-on" : "thumb"}>
                <img src=${im} alt=""/>
              </button>`)}
          </div>`}
      </div>

      <div class="px-4 pt-2">
        <div class="flex items-baseline gap-2.5">
          <div class="text-[26px] font-bold">${fmt(p.price)}</div>
          <div class="text-sm opacity-60">${cur}</div>
          ${p.old_price > p.price && html`<div class="line-through opacity-40">${fmt(p.old_price)}</div>`}
        </div>
        <h2 class="text-[17px] font-semibold mt-1.5 leading-snug">${nameOf(p, lang)}</h2>
        <div class="flex items-center gap-2 mt-1 text-xs opacity-70">
          ${p.brand && html`<span>${p.brand}</span>`}
          <span class=${soldOut ? "text-red-500" : "text-green-600"}>
            ${soldOut ? t.out_of_stock : t.stock_left.replace("{n}", p.stock)}
          </span>
        </div>

        ${sizes.length > 0 && html`
          <div class="mt-4">
            <div class="text-xs opacity-60 mb-2">${t.sizes}</div>
            <div class="flex gap-2 flex-wrap">
              ${sizes.map((s) => html`<button key=${s} onClick=${() => { haptic(); setSize(s); }} class=${size === s ? "opt opt-on" : "opt"}>${s}</button>`)}
            </div>
          </div>`}
        ${colors.length > 0 && html`
          <div class="mt-4">
            <div class="text-xs opacity-60 mb-2">${t.colors}</div>
            <div class="flex gap-2 flex-wrap">
              ${colors.map((c) => html`<button key=${c} onClick=${() => { haptic(); setColor(c); }} class=${color === c ? "opt opt-on" : "opt"}>${c}</button>`)}
            </div>
          </div>`}

        <div class="mt-4 flex items-center gap-3">
          <div class="text-xs opacity-60">${t.qty}</div>
          <div class="qty">
            <button onClick=${() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span>${qty}</span>
            <button onClick=${() => setQty((q) => Math.min(p.stock || 1, q + 1))}>+</button>
          </div>
        </div>

        ${nameOf(p, lang, "desc") && html`<div class="mt-5 text-sm whitespace-pre-line opacity-80 leading-relaxed">${nameOf(p, lang, "desc")}</div>`}
      </div>

      <div class="stickybar">
        <button onClick=${add} disabled=${adding || soldOut} class="btn-primary flex-1">
          ${soldOut ? t.out_of_stock : adding ? "..." : `🛒 ${t.add_to_cart}`}
        </button>
      </div>
    </div>`;
}

function CartPage({ lang, go, cart, refreshCart, config }) {
  const t = T[lang];
  const cur = config?.currency || "";
  const [busy, setBusy] = useState(false);
  const items = cart.items || [];
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  const setQty = async (id, qty) => {
    setBusy(true);
    try { await api("/cart/update", { method: "POST", body: { id, qty } }); await refreshCart(); }
    catch (e) { toast(e.message, "err"); }
    setBusy(false);
  };
  const del = async (id) => {
    setBusy(true);
    try { await api("/cart/delete", { method: "POST", body: { id } }); await refreshCart(); }
    catch (e) { toast(e.message, "err"); }
    setBusy(false);
  };
  const minOk = subtotal >= (config?.min_order_total || 0);

  return html`
    <div class="pb-40">
      <${TopBar} title=${t.cart} right=${items.length ? html`<button class="text-xs opacity-60" onClick=${async () => { await api("/cart/clear", { method: "POST" }); refreshCart(); }}>${t.clear}</button>` : null}/>
      ${items.length === 0 ? html`<${Empty} icon="🛒" text=${t.empty_cart}/>` : html`
        <div class="p-4 space-y-3">
          ${items.map((i) => html`
            <div key=${i.id} class="cart-row">
              <div class="cart-img" onClick=${() => go(`/product/${i.product_id}`)}>
                ${i.images?.[0] ? html`<img src=${i.images[0]} alt=""/>` : html`<div class="ph">👕</div>`}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium line-clamp-2">${nameOf(i, lang)}</div>
                <div class="text-[11px] opacity-55 mt-0.5">${[i.size, i.color].filter(Boolean).join(" · ")}</div>
                <div class="flex items-center justify-between mt-2">
                  <div class="qty qty-sm">
                    <button disabled=${busy} onClick=${() => (i.qty > 1 ? setQty(i.id, i.qty - 1) : del(i.id))}>−</button>
                    <span>${i.qty}</span>
                    <button disabled=${busy} onClick=${() => setQty(i.id, i.qty + 1)}>+</button>
                  </div>
                  <div class="font-semibold text-sm">${fmt(i.price * i.qty)} ${cur}</div>
                </div>
              </div>
              <button class="opacity-40 self-start" onClick=${() => del(i.id)}>✕</button>
            </div>`)}
        </div>
        <div class="stickybar flex-col gap-2">
          <div class="flex justify-between w-full text-sm">
            <span class="opacity-70">${t.subtotal}</span><span class="font-bold">${fmt(subtotal)} ${cur}</span>
          </div>
          ${!minOk && html`<div class="text-[11px] text-red-500 w-full">${t.min_order.replace("{sum}", `${fmt(config.min_order_total)} ${cur}`)}</div>`}
          <button disabled=${!minOk} onClick=${() => go("/checkout")} class="btn-primary w-full">${t.checkout}</button>
        </div>`}
    </div>`;
}

function CheckoutPage({ lang, go, refreshCart, cart, config }) {
  const t = T[lang];
  const cur = config?.currency || "";
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", country_id: "", city: "", address: "", payment: "cash", promo: "", note: "" });
  const [promoInfo, setPromoInfo] = useState(null);
  const [totals, setTotals] = useState({ subtotal: 0, shipping: 0, discount: 0, total: 0 });
  const [sending, setSending] = useState(false);
  const methods = config?.payment_methods?.length ? config.payment_methods : ["cash"];

  useEffect(() => {
    api("/countries").then((cs) => { setCountries(cs); if (cs[0]) setForm((f) => ({ ...f, country_id: String(cs[0].id) })); }).catch(() => {});
    const u = tg?.initDataUnsafe?.user;
    if (u) setForm((f) => ({ ...f, name: f.name || [u.first_name, u.last_name].filter(Boolean).join(" ") }));
  }, []);

  // Yakuniy summani doim serverdan olamiz — mijoz tomonida hisob buzilmasin
  useEffect(() => {
    const qp = new URLSearchParams();
    if (form.country_id) qp.set("country_id", form.country_id);
    if (promoInfo?.valid) qp.set("promo", form.promo);
    api(`/checkout/preview?${qp}`).then(setTotals).catch(() => {});
  }, [form.country_id, promoInfo, cart.items]);

  useEffect(() => { if (!methods.includes(form.payment)) setForm((f) => ({ ...f, payment: methods[0] })); }, [config]);

  const applyPromo = async () => {
    if (!form.promo.trim()) return;
    try {
      const r = await api("/promo/check", { method: "POST", body: { code: form.promo.trim() } });
      setPromoInfo(r);
      if (!r.valid) { tg?.HapticFeedback?.notificationOccurred("error"); toast("❌ " + (r.reason || ""), "err"); }
      else toast(`✅ -${r.percent}%`, "ok");
    } catch (e) { toast(e.message, "err"); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) return toast(t.required, "err");
    setSending(true);
    try {
      const body = { ...form, promo: promoInfo?.valid ? form.promo.trim() : null, country_id: form.country_id ? Number(form.country_id) : null };
      const r = await api("/orders", { method: "POST", body });
      tg?.HapticFeedback?.notificationOccurred("success");
      await refreshCart();
      toast(t.order_sent, "ok");
      go(`/orders/${r.order_id}`);
    } catch (e) { toast(e.message, "err"); }
    setSending(false);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const payLabel = { cash: t.cash, card: t.card, click: t.click, payme: t.payme, transfer: t.transfer };

  return html`
    <div class="pb-28">
      <${TopBar} title=${t.checkout} onBack=${() => history.back()}/>
      <div class="p-4 space-y-3">
        <div><label class="lbl">${t.name} *</label><input value=${form.name} onInput=${set("name")} class="fld"/></div>
        <div><label class="lbl">${t.phone} *</label><input type="tel" value=${form.phone} onInput=${set("phone")} placeholder="+998 90 123 45 67" class="fld"/></div>
        ${countries.length > 0 && html`
          <div><label class="lbl">${t.country}</label>
            <select value=${form.country_id} onChange=${set("country_id")} class="fld">
              ${countries.map((c) => html`<option key=${c.id} value=${c.id}>${c.flag || ""} ${nameOf(c, lang)}</option>`)}
            </select>
          </div>`}
        <div><label class="lbl">${t.city}</label><input value=${form.city} onInput=${set("city")} class="fld"/></div>
        <div><label class="lbl">${t.address} *</label><input value=${form.address} onInput=${set("address")} class="fld"/></div>

        <div>
          <label class="lbl">${t.payment}</label>
          <div class="grid grid-cols-2 gap-2 mt-1">
            ${methods.map((p) => html`
              <button key=${p} onClick=${() => { haptic(); setForm((f) => ({ ...f, payment: p })); }} class=${form.payment === p ? "opt opt-on" : "opt"}>${payLabel[p] || p}</button>`)}
          </div>
          ${["card", "transfer"].includes(form.payment) && config?.card_number && html`
            <div class="notice mt-2 text-left">
              💳 ${t.card_info}: <b>${config.card_number}</b>${config.card_holder ? html`<br/>${config.card_holder}` : null}
            </div>`}
        </div>

        <div>
          <label class="lbl">${t.promo}</label>
          <div class="flex gap-2 mt-1">
            <input value=${form.promo} onInput=${set("promo")} class="fld flex-1"/>
            <button onClick=${applyPromo} class="btn-primary px-5">${t.apply}</button>
          </div>
        </div>
        <div><label class="lbl">${t.note}</label><input value=${form.note} onInput=${set("note")} class="fld"/></div>

        <div class="summary">
          <div class="row"><span>${t.subtotal}</span><span>${fmt(totals.subtotal)} ${cur}</span></div>
          <div class="row"><span>${t.shipping}</span><span>${totals.shipping ? `${fmt(totals.shipping)} ${cur}` : t.free}</span></div>
          ${totals.discount > 0 && html`<div class="row text-green-600"><span>${t.discount}</span><span>−${fmt(totals.discount)} ${cur}</span></div>`}
          <div class="row total"><span>${t.total}</span><span>${fmt(totals.total)} ${cur}</span></div>
        </div>
        <button onClick=${submit} disabled=${sending || !cart.items.length} class="btn-primary w-full py-4">${sending ? "..." : t.checkout}</button>
      </div>
    </div>`;
}

const STATUS_STYLE = { new: "st-blue", paid: "st-green", packing: "st-amber", shipping: "st-amber", delivered: "st-green", cancelled: "st-red" };

function OrdersPage({ lang, go }) {
  const t = T[lang];
  const [orders, setOrders] = useState(null);
  useEffect(() => { api("/orders").then(setOrders).catch(() => setOrders([])); }, []);
  if (orders === null) return html`<div><${TopBar} title=${t.my_orders} onBack=${() => history.back()}/><div class="p-4 space-y-3">${[1, 2, 3].map((i) => html`<${Skeleton} key=${i} h=${96} cls="rounded-2xl"/>`)}</div></div>`;
  return html`
    <div class="pb-24">
      <${TopBar} title=${t.my_orders} onBack=${() => history.back()}/>
      ${orders.length === 0 ? html`<${Empty} icon="📦" text=${t.no_orders}/>` : html`
        <div class="p-4 space-y-3">
          ${orders.map((o) => {
            let items = []; try { items = JSON.parse(o.items_json); } catch {}
            return html`
              <div key=${o.id} class="card-box" onClick=${() => go(`/orders/${o.id}`)}>
                <div class="flex justify-between items-center">
                  <div class="font-semibold">#${o.id}</div>
                  <span class=${"st " + (STATUS_STYLE[o.status] || "st-blue")}>${t.status[o.status] || o.status}</span>
                </div>
                <div class="text-[13px] opacity-75 mt-2 line-clamp-2">${items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</div>
                <div class="flex justify-between mt-2 pt-2 divider">
                  <span class="opacity-55 text-xs">${new Date(o.created_at * 1000).toLocaleString()}</span>
                  <span class="font-bold text-sm">${fmt(o.total)} ${o.currency || ""}</span>
                </div>
              </div>`;
          })}
        </div>`}
    </div>`;
}

function OrderPage({ lang, id, go }) {
  const t = T[lang];
  const [o, setO] = useState(null);
  const [err, setErr] = useState("");
  const load = () => api(`/orders/${id}`).then(setO).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const cancel = async () => {
    if (!confirm(t.cancel_confirm)) return;
    try { await api(`/orders/${id}/cancel`, { method: "POST" }); toast(t.cancelled_ok, "ok"); load(); }
    catch (e) { toast(e.message, "err"); }
  };

  if (err) return html`<div><${TopBar} title="#${id}" onBack=${() => history.back()}/><${Empty} icon="⚠️" text=${err}/></div>`;
  if (!o) return html`<div><${TopBar} title="#${id}" onBack=${() => history.back()}/><div class="p-4"><${Skeleton} h=${220} cls="rounded-2xl"/></div></div>`;

  let items = []; try { items = JSON.parse(o.items_json); } catch {}
  const cur = o.currency || "";
  return html`
    <div class="pb-24">
      <${TopBar} title=${`#${o.id}`} onBack=${() => history.back()}/>
      <div class="p-4 space-y-3">
        <div class="card-box flex items-center justify-between">
          <span class=${"st " + (STATUS_STYLE[o.status] || "st-blue")}>${t.status[o.status] || o.status}</span>
          <span class="text-xs opacity-55">${new Date(o.created_at * 1000).toLocaleString()}</span>
        </div>

        <div class="card-box space-y-2">
          ${items.map((i, k) => html`
            <div key=${k} class="flex justify-between text-sm">
              <span class="flex-1 pr-2">${i.name} ${[i.size, i.color].filter(Boolean).length ? html`<span class="opacity-50">(${[i.size, i.color].filter(Boolean).join("/")})</span>` : null} × ${i.qty}</span>
              <span class="font-medium whitespace-nowrap">${fmt(i.price * i.qty)}</span>
            </div>`)}
          <div class="divider pt-2 space-y-1 text-sm">
            <div class="row"><span>${t.subtotal}</span><span>${fmt(o.subtotal)} ${cur}</span></div>
            <div class="row"><span>${t.shipping}</span><span>${o.shipping ? `${fmt(o.shipping)} ${cur}` : t.free}</span></div>
            ${o.discount > 0 && html`<div class="row text-green-600"><span>${t.discount}</span><span>−${fmt(o.discount)} ${cur}</span></div>`}
            <div class="row total"><span>${t.total}</span><span>${fmt(o.total)} ${cur}</span></div>
          </div>
        </div>

        <div class="card-box text-sm space-y-1">
          <div>👤 ${o.name}</div><div>📞 ${o.phone}</div>
          <div>📍 ${[o.city, o.address].filter(Boolean).join(", ")}</div>
          <div>💳 ${t[o.payment] || o.payment}</div>
          ${o.note && html`<div class="opacity-70">💬 ${o.note}</div>`}
        </div>

        ${o.events?.length > 0 && html`
          <div class="card-box">
            <div class="text-xs opacity-60 mb-2">${t.history}</div>
            <div class="space-y-2">
              ${o.events.map((e) => html`
                <div key=${e.id} class="flex gap-2 text-[13px]">
                  <span class="opacity-45 whitespace-nowrap">${new Date(e.created_at * 1000).toLocaleDateString()}</span>
                  <span>${t.status[e.status] || e.status}</span>
                  ${e.comment && html`<span class="opacity-60">— ${e.comment}</span>`}
                </div>`)}
            </div>
          </div>`}

        ${["new", "paid"].includes(o.status) && html`
          <button onClick=${cancel} class="w-full py-3 rounded-2xl text-sm text-red-500 card-box">${t.cancel_order}</button>`}
      </div>
    </div>`;
}

function FavoritesPage({ lang, go, config }) {
  const t = T[lang];
  const [items, setItems] = useState(null);
  useEffect(() => { api("/favorites").then(setItems).catch(() => setItems([])); }, []);
  if (items === null) return html`<div><${TopBar} title=${t.favorites} onBack=${() => history.back()}/><${GridSkeleton}/></div>`;
  return html`
    <div class="pb-24">
      <${TopBar} title=${t.favorites} onBack=${() => history.back()}/>
      ${items.length === 0 ? html`<${Empty} icon="❤️" text=${t.nothing}/>` : html`
        <div class="grid grid-cols-2 gap-3 p-4">
          ${items.map((p) => html`<${ProductCard} key=${p.id} p=${p} lang=${lang} go=${go} cur=${config?.currency || ""}/>`)}
        </div>`}
    </div>`;
}

function ProfilePage({ lang, setLang, go, user, config }) {
  const t = T[lang];
  const support = config?.support_username ? `https://t.me/${String(config.support_username).replace(/^@/, "")}` : null;
  return html`
    <div class="pb-24">
      <${TopBar} title=${t.profile}/>
      <div class="p-4 space-y-3">
        <div class="card-box flex items-center gap-3">
          ${user?.photo_url
            ? html`<img src=${user.photo_url} alt="" class="avatar object-cover" style="width:56px;height:56px;border-radius:9999px;"/>`
            : html`<div class="avatar">${(user?.first_name || "?")[0]}</div>`}
          <div class="min-w-0">
            <div class="font-semibold truncate">${[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "—"}</div>
            <div class="text-[13px] opacity-55 truncate">${user?.username ? "@" + user.username : user?.phone || ""}</div>
          </div>
        </div>
        <button onClick=${() => go("/orders")} class="menu-row">📦 ${t.my_orders} <span class="opacity-40">›</span></button>
        <button onClick=${() => go("/favorites")} class="menu-row">❤️ ${t.favorites} <span class="opacity-40">›</span></button>
        ${support && html`<a href=${support} target="_blank" class="menu-row">💬 ${t.support} <span class="opacity-40">›</span></a>`}
        ${config?.support_phone && html`<a href=${"tel:" + config.support_phone} class="menu-row">📞 ${config.support_phone} <span class="opacity-40">›</span></a>`}
        <div class="card-box">
          <div class="text-xs opacity-60 mb-2">🌐 ${t.change_lang}</div>
          <div class="grid grid-cols-2 gap-2">
            ${Object.entries(LANG_NAMES).map(([k, v]) => html`
              <button key=${k} onClick=${() => { haptic(); setLang(k); }} class=${lang === k ? "opt opt-on" : "opt"}>${v}</button>`)}
          </div>
        </div>
        ${config?.about && html`<div class="card-box text-[13px] opacity-75 whitespace-pre-line">${config.about}</div>`}
        <div class="text-center text-[11px] opacity-35 pt-2">${config?.shop_name || ""} · v2.0</div>
      </div>
    </div>`;
}

/* ------------------------------ App ------------------------------ */
function App() {
  const [lang, setLangState] = useState(getLang());
  const [route, go] = useRoute();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [home, setHome] = useState(null);
  const [cart, setCart] = useState({ items: [] });
  const [favIds, setFavIds] = useState(new Set());
  const [toasts, setToasts] = useState([]);

  toastFn = useCallback((msg, kind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2600);
  }, []);

  const setLang = async (l) => {
    localStorage.setItem("lang", l);
    setLangState(l);
    document.documentElement.lang = l;
    try { await api("/set-lang", { method: "POST", body: { lang: l } }); } catch {}
  };

  const refreshCart = useCallback(async () => {
    try { setCart({ items: await api("/cart") }); } catch {}
  }, []);

  const refreshFavs = useCallback(async () => {
    try { setFavIds(new Set((await api("/favorites")).map((p) => p.id))); } catch {}
  }, []);

  const toggleFav = useCallback(async (pid) => {
    try {
      const r = await api("/favorites/toggle", { method: "POST", body: { product_id: pid } });
      setFavIds((s) => { const n = new Set(s); r.favorited ? n.add(pid) : n.delete(pid); return n; });
    } catch (e) { toast(e.message, "err"); }
  }, []);

  useEffect(() => {
    api("/config").then(setConfig).catch(() => {});
    api("/me", { method: "POST" }).then((r) => { setUser(r.user); if (r.user?.lang) setLangState(r.user.lang); }).catch(() => {});
    api("/home").then(setHome).catch((e) => toast(e.message, "err"));
    refreshCart();
    refreshFavs();
  }, []);

  // Telegram BackButton
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (route === "/" || route === "") bb.hide();
    else { bb.show(); }
    const on = () => history.back();
    bb.onClick(on);
    return () => bb.offClick(on);
  }, [route]);

  const [path, queryStr] = route.split("?");
  const params = new URLSearchParams(queryStr || "");
  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);

  let page;
  if (path === "/" || path === "") page = html`<${HomePage} lang=${lang} go=${go} home=${home} config=${config}/>`;
  else if (path === "/catalog") page = html`<${CatalogPage} lang=${lang} go=${go} params=${params} config=${config}/>`;
  else if (path.startsWith("/product/")) page = html`<${ProductPage} lang=${lang} go=${go} id=${path.split("/")[2]} refreshCart=${refreshCart} config=${config} favIds=${favIds} toggleFav=${toggleFav}/>`;
  else if (path === "/cart") page = html`<${CartPage} lang=${lang} go=${go} refreshCart=${refreshCart} cart=${cart} config=${config}/>`;
  else if (path === "/checkout") page = html`<${CheckoutPage} lang=${lang} go=${go} refreshCart=${refreshCart} cart=${cart} config=${config}/>`;
  else if (path === "/profile") page = html`<${ProfilePage} lang=${lang} setLang=${setLang} go=${go} user=${user} config=${config}/>`;
  else if (path.startsWith("/orders/")) page = html`<${OrderPage} lang=${lang} id=${path.split("/")[2]} go=${go}/>`;
  else if (path === "/orders") page = html`<${OrdersPage} lang=${lang} go=${go}/>`;
  else if (path === "/favorites") page = html`<${FavoritesPage} lang=${lang} go=${go} config=${config}/>`;
  else page = html`<${Empty} icon="🤷" text="404"/>`;

  return html`<div>
    ${page}
    <${BottomNav} route=${path} go=${go} cartCount=${cartCount} lang=${lang}/>
    <${Toast} items=${toasts}/>
  </div>`;
}

render(html`<${App}/>`, document.getElementById("root"));
