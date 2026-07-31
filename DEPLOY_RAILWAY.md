# 🚂 Railway'ga deploy qilish (to'liq qo'llanma)

## 1. Loyihani yuklash
1. ZIP'ni oching → papkani GitHub'ga repo qilib yuklang (yoki Railway CLI: `railway up`).
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → shu repo'ni tanlang.
3. Railway `railway.json` + `nixpacks.toml` ni avtomatik topadi va `npm start` bilan ishga tushiradi.
   (Agar `better-sqlite3` build'da xato bersa: Settings → Build → **Dockerfile** ni tanlang, Dockerfile tayyor turibdi.)

## 2. Volume (BAZANI SAQLASH UCHUN — MAJBURIY)
Railway'da disk vaqtinchalik. Har deploy'da baza o'chib ketmasligi uchun:
- Service → **Variables/Settings → Volumes → New Volume**
- Mount path: `/data`

Kod avtomatik `/data/shop.db` ni ishlatadi (qo'shimcha sozlash shart emas).
Backup papkasi uchun ham: `BACKUP_DIR=/data/backups`.

## 3. Variables (Service → Variables → Raw Editor'ga qo'ying)
```
BOT_TOKEN=8xxxxxx:AAxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_TG_IDS=123456789,987654321
ORDERS_CHAT_ID=
NODE_ENV=production
TRUST_PROXY=1
USE_WEBHOOK=1
JWT_SECRET=<openssl rand -hex 32>
ADMIN_LOGIN=admin
ADMIN_PASSWORD=juda-kuchli-parol-2026
SHOP_NAME=Baraka Market
CURRENCY=UZS
ALLOW_DEV_AUTH=0
BACKUP_DIR=/data/backups
BACKUP_INTERVAL_HOURS=12
BACKUP_KEEP=20
```
Eslatma:
- `PORT` ni **qo'lda yozmang** — Railway o'zi beradi.
- `PUBLIC_URL` ni yozmasangiz, kod `RAILWAY_PUBLIC_DOMAIN` dan avtomatik oladi.
- Parol o'rniga hash: `npm run hash -- "parolingiz"` → `ADMIN_PASSWORD_HASH=...`

## 4. Domen
Service → **Settings → Networking → Generate Domain**.
`https://xxxx.up.railway.app` chiqadi — Mini App va webhook shu domendan ishlaydi.

Agar domenni Generate qilgandan keyin qo'shsangiz, servisni bir marta **Redeploy** qiling (webhook yangi domenga o'rnatiladi).

## 5. Tekshirish
- `https://<domen>/healthz` → `{"ok":true,...}`
- Telegram'da botga `/start` → Mini App tugmasi
- Admin panel: `https://<domen>/admin` (login/parol yoki telefon raqam orqali)
- Botda `/admin` → inline menyu, `/orders`, `/audit`, `/logzip`, `/rbac`, `/report`

## 6. Tez-tez uchraydigan muammolar
| Muammo | Yechim |
|---|---|
| Build'da `better-sqlite3` xatosi | Builder'ni **Dockerfile** ga o'zgartiring |
| Har deploy'da mahsulotlar yo'qoladi | `/data` volume qo'shilmagan |
| Mini App tugmasi yo'q | Domen generate qilinmagan yoki `PUBLIC_URL` https emas |
| Bot javob bermaydi | `BOT_TOKEN` xato yoki boshqa joyda polling ishlayapti |
| Deploy Crashed | Logs → odatda `JWT_SECRET`/`ADMIN_PASSWORD` yo'qligi |

## 7. Yangilash
GitHub'ga push qilsangiz Railway avtomatik qayta deploy qiladi. Deploy oldidan botdan `/backup` qilib oling.
