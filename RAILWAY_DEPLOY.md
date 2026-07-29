# Railway'ga joylash (qadam-baqadam)

## 1. Kodni GitHub'ga yuklang
Ushbu papkani yangi GitHub repo'ga push qiling (`.env` faylini YUKLAMANG).

## 2. Railway'da loyiha yarating
railway.app → New Project → Deploy from GitHub repo → shu repo.
Build avtomatik (Nixpacks, Node 20, `npm start`).

## 3. Volume qo'shing (MUHIM — SQLite uchun)
Service → Settings → Volumes → New Volume → Mount path: `/data`
Busiz har deploy'da baza o'chib ketadi.

## 4. Domen oling
Settings → Networking → Generate Domain → masalan
`telegram-shop-pro-production.up.railway.app`

## 5. Variables (Variables tabida qo'ying)
`.env.railway.example` dagi barcha qiymatlarni kiriting:
- BOT_TOKEN — @BotFather tokeni
- ADMIN_TG_IDS=8787603995
- USE_WEBHOOK=1
- PUBLIC_URL=https://<4-qadamdagi domen>   (oxirida / yo'q!)
- DB_FILE=/data/shop.db , BACKUP_DIR=/data/backups
- JWT_SECRET — 64 belgi tasodifiy (masalan: `openssl rand -hex 32`)
- ADMIN_PASSWORD — kamida 10 belgi (yoki `npm run hash -- "parol"` bilan ADMIN_PASSWORD_HASH)
- NODE_ENV=production , TRUST_PROXY=1 , ALLOW_DEV_AUTH=0
PORT ni Railway o'zi beradi — qo'lda o'zgartirmang.

## 6. Deploy va tekshiruv
- Deploy log'da "Bot ishga tushdi" ko'rinadi.
- Botga /start yuboring → menyu chiqishi kerak.
- Admin panel: https://<domen>/admin.html
- Kunlik hisobot: menyudan yoqing yoki `/reportauto on 9`.

## 7. BotFather Mini App
/setmenubutton → Web App URL = https://<domen>/
