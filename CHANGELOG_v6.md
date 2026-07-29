# v6 — Kunlik hisobot, RBAC, kengaytirilgan audit

## Yangi imkoniyatlar

### 📊 Kunlik avtomatik ZIP hisobot
- Yangi modul: `server/src/scheduler.js`. Har 5 daqiqada tekshiruvchi taymer.
- Belgilangan soatda barcha adminlarga ZIP yuboradi. Ichida:
  - `summary.txt` — buyurtmalar (jami / 24 soat / 7 kun), statuslar bo'yicha kesim.
  - `orders_24h.csv`, `orders_totals.csv` — statistika.
  - `errors_24h.csv` — oxirgi 24 soatlik xatolar.
  - `audit_24h.csv` — oxirgi 24 soatlik audit yozuvlari.
- Sozlash:
  - Bot menyusi: **📊 Kunlik hisobot** → Yoqish/O'chirish + soat tanlash (09/12/18/21).
  - Yoki komanda: `/reportauto on 9`, `/reportauto off`.
  - Qo'lda darhol yuborish: `/report` yoki menyudan **📤 Hozir yuborish**.
- Har bir yuborish audit jurnaliga tushadi (`report.daily.auto` / `report.daily.manual`).
- Sozlamalar `settings` jadvalida: `daily_report_enabled` (0/1), `daily_report_hour` (0–23).

### 🧾 Audit — filtrlash va tezkor qidiruv
- Audit ekranida davr tugmalari: **Barcha vaqt / Bugun / 7 kun / 30 kun**.
- Sahifalash (◀️ N/M ▶️), jami va filtrdagi soni ko'rinadi.
- Yangi buyruqlar:
  - `/auditfind MATN` — matn (action + target) bo'yicha tez qidiruv.
  - `/auditby LOGIN` — admin (tg_id yoki username / login) bo'yicha filtr.
  - `/auditact SO'Z` — amal turi (masalan `restore`, `orders.filter`) bo'yicha filtr.
  - `/auditclr` — filtrni tozalash.
- Filtrlar har admin uchun alohida sessiyada saqlanadi.

### 📤 /orders — joriy kesim CSV eksport
- Avvalgi `📤 CSV eksport` tugmasi endi caption'da joriy filtrni ko'rsatadi
  (status, davr, qidiruv), ya'ni faqat ekrandagi kesim eksport qilinadi.
- Fayl nomi: `orders_<timestamp>.csv`, jami 5000 tagacha qator.

### 🛡 RBAC — bot ichida inline menyu orqali
- Yangi bo'lim: bosh menyudan **🛡 Rollar (RBAC)**.
- Barcha adminlar ro'yxati (holat + rol + oxirgi kirish).
- Har bir admin uchun ichki ekran:
  - Rolni almashtirish (Superadmin / Admin / Manager / Viewer) tugmalar bilan.
  - **⏸ O'chirish / ▶️ Yoqish** — hisobni faollashtirish.
  - Joriy ruxsatlar (`perms`) matritsasi ko'rinadi.
- Buyruq: `/rbac` — ekranni ochadi.
- Barcha o'zgarishlar audit jurnaliga yoziladi (`rbac.role.change`, `rbac.active.toggle`).
- Xavfsizlik: bot-panel RBAC operatsiyalarini superadmin sifatida bajaradi;
  faqat `config.adminIds` ichida bo'lgan Telegram foydalanuvchilar kira oladi
  (v5 dagi `isAdmin` guard).

## Fayllar
- **Yangi:** `server/src/scheduler.js`.
- **O'zgargan:** `server/src/bot_admin.js`, `server/src/db.js`, `server/src/index.js`.
- **Saqlangan:** v5 ning barcha imkoniyatlari (paginatsiya, 2-bosqichli restore, ZIP eksport, audit yozish, telefon-login).
