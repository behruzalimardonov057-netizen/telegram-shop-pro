# Telegram Shop Pro — Kiyimlar do'koni

Uzum uslubidagi to'liq professional Telegram bot + Mini App + Admin panel.

## Xususiyatlar

- 🤖 **Telegram bot** — `/start` bilan Mini App tugmasini beradi
- 📱 **Mini App (WebApp)** — chiroyli mobil interfeys: bosh sahifa, kategoriyalar, mahsulot, savat, buyurtma, profil
- 👨‍💼 **Admin panel** (`/admin`) — brauzerda login bilan hamma narsani boshqarish:
  - Mahsulotlar (ko'p rasm, o'lcham, rang, chegirma, stock)
  - Kategoriyalar (daraxt, cheksiz darajali)
  - Davlatlar va yetkazib berish narxlari
  - Bannerlar (bosh sahifadagi slayder)
  - Promo-kodlar
  - Buyurtmalar (status boshqaruvi)
  - Foydalanuvchilar (mass-xabar)
  - Tarjimalar (6 til yoki xohlagancha qo'shish)
  - Statistika
- 🌐 **6 til:** O'zbek, Rus, Ingliz, Qozoq, Turk, Tojik (admin qo'sha oladi)
- 🌍 **Davlatlar:** O'zbekiston, Rossiya, Qozog'iston, Turkiya, Tojikiston (default)
- 💾 **SQLite** — hech qanday DB o'rnatish shart emas, bir fayl
- 🔐 **Xavfsizlik:** Telegram `initData` HMAC verify, admin bcrypt+JWT

## Talablar

- Node.js 18+
- HTTPS bilan public domen (Mini App faqat HTTPS da ishlaydi)
  - Variantlar: VPS + Caddy (avtomatik SSL), Cloudflare Tunnel (bepul, domen shart emas)

## O'rnatish

```bash
npm install
cp .env.example .env
```

`.env` faylni to'ldiring:
- `BOT_TOKEN` — @BotFather dan olingan
- `ADMIN_TG_IDS` — o'zingizning Telegram ID (@userinfobot orqali)
- `PUBLIC_URL` — HTTPS domeningiz (masalan `https://shop.example.com`)
- `ADMIN_LOGIN` va `ADMIN_PASSWORD` — admin panelga kirish
- `JWT_SECRET` — uzun tasodifiy satr (`openssl rand -hex 32`)

```bash
npm start
```

Terminalda: `🤖 Bot ready`, `🌐 Server http://localhost:3000`.

## Public URL sozlash (HTTPS)

### Variant A — Caddy (VPS + domen)
```bash
# /etc/caddy/Caddyfile
shop.example.com {
  reverse_proxy localhost:3000
}
```
`sudo systemctl reload caddy` — SSL avtomatik oladi.

### Variant B — Cloudflare Tunnel (bepul, domen shart emas)
```bash
cloudflared tunnel --url http://localhost:3000
```
Berilgan `https://xxx.trycloudflare.com` URL ni `.env` da `PUBLIC_URL` qilib qo'ying va botni qayta ishga tushiring.

### BotFather'da Mini App tugmasi
1. `/mybots` → botingiz → **Bot Settings → Menu Button**
2. URL: sizning `PUBLIC_URL` (masalan `https://shop.example.com/`)
3. Nom: `🛍 Shop`

## Doimiy ishlashi uchun (pm2)

```bash
npm install -g pm2
pm2 start server/src/index.js --name shop-pro
pm2 save
pm2 startup
```

## Foydalanish

- **Foydalanuvchi:** botga `/start` yuboradi → tilni tanlaydi → **"🛍 Do'konni ochish"** tugmasini bosadi → Mini App ochiladi.
- **Admin:** brauzerda `https://shop.example.com/admin` — login/parol bilan kiradi va hamma narsani boshqaradi.

## Fayl tuzilishi

```
telegram-shop-pro/
├── server/src/       Node.js backend (bot + API)
├── public/           Mini App va admin panel (statik)
├── uploads/          Yuklangan rasmlar
├── shop.db           SQLite baza (avtomatik yaratiladi)
├── .env              Sozlamalar
└── package.json
```

## Xavfsizlik

- BotFather'dan yangi token oling (avvalgi chatda ochilgani uchun).
- `ADMIN_PASSWORD` va `JWT_SECRET` ni kuchli qiling.
- Server portini (3000) tashqarga chiqarmang — faqat reverse proxy orqali.

---

## 🆕 Yangi imkoniyatlar

### 💾 Zaxira (backup) va tiklash
* Admin panel → **Zaxira** bo'limi: bir bosishda nusxa olish, yuklab olish, `.db` fayl yuklash, tiklash, o'chirish.
* Har `BACKUP_INTERVAL_HOURS` (default 12) soatda avto-zaxira, oxirgi `BACKUP_KEEP` (20) nusxa saqlanadi.
* Tiklashdan oldin avtomatik `pre-restore` xavfsizlik nusxasi olinadi, so'ng server qayta ishga tushadi.
* Terminaldan: `npm run backup` va `npm run restore [fayl]`.

### 🔁 Avtomatik qayta urinish
* Telegram xabarlari, buyurtma bildirishnomalari va webhooklar xato bo'lsa `retry_queue` jadvaliga tushadi.
* Eksponensial kechikish: 2s → 4s → 8s … `RETRY_MAX_DELAY_MS` gacha, `RETRY_MAX_ATTEMPTS` (6) urinish.
* Server qayta ishga tushsa ham navbat saqlanadi. Monitoring bo'limidan qo'lda qayta urinish yoki bekor qilish mumkin.

### 🩺 Monitoring
* **Monitoring** bo'limi: xatolar/ogohlantirishlar statistikasi, 24 soatlik grafik, loglar (daraja/manba/qidiruv filtri), qayta urinish navbati va kirish tarixi.
* Loglar `logs` jadvalida; `LOG_MAX_ROWS` / `LOG_MAX_AGE_DAYS` bo'yicha avtomatik tozalanadi.

### 🔐 Rollar va ruxsatlar
| Rol | Ruxsatlar |
|---|---|
| superadmin | hammasi (zaxira, adminlar boshqaruvi) |
| admin | zaxira va adminlardan tashqari hammasi |
| manager | dashboard, mahsulot, kategoriya, buyurtma, foydalanuvchi |
| viewer | dashboard, buyurtmalar, monitoring (faqat ko'rish) |

* Birinchi ishga tushirishda `ADMIN_LOGIN` / `ADMIN_PASSWORD` dan `superadmin` yaratiladi.
* **Adminlar** bo'limidan yangi admin qo'shish, rol/qo'shimcha ruxsat berish, faolsizlantirish mumkin.
* Har bir admin **Mening hisobim** bo'limida parolini o'zgartiradi.

### 🤖 Botning o'z admin paneli
`ADMIN_TG_IDS` da ko'rsatilgan Telegram ID'lar uchun bot ichida to'liq boshqaruv (tugmali menyu):

| Buyruq | Vazifasi |
|---|---|
| `/admin` | Asosiy panel: statistika + tugmalar |
| `/monitoring` | Loglar statistikasi, manbalar bo'yicha |
| `/errors` | Oxirgi 10 ta xato |
| `/queue` | Qayta urinish navbati (ishga tushirish, qayta navbat, tozalash) |
| `/backup` | Hozir zaxira olish — fayl botga yuboriladi |
| `/backups` | Zaxiralar ro'yxati (yuklab olish / tiklash tugmalari) |
| `/restore <fayl>` | Zaxiradan tiklash (tasdiqlash bilan) |
| `/health` | Uptime, xotira, baza hajmi, rejim |

* `.db` faylni shunchaki botga tashlasangiz, u zaxira sifatida saqlanadi va tiklash mumkin.
* Har qanday `error` darajali log adminlarga avtomatik 🚨 xabar qilib boriladi (daqiqasiga 1 marta).
* Oddiy foydalanuvchilar bu buyruqlarni ko'rmaydi va ishlata olmaydi.
