# v5 — Yangi imkoniyatlar

## 1) Buyurtmalar (bot ichida)
- Paginatsiya: ⏮ ◀️ N/M ▶️ ⏭ tugmalari.
- Filtrlar: **status** (barchasi/yangi/kutilmoqda/to'langan/yuborilgan/yakunlangan/bekor),
  **davr** (bugun / 7 kun / 30 kun / barcha vaqt), **qidiruv** — `/find MATN`.
- Filtrni tozalash: tugma yoki `/clearfilter`.
- **CSV eksport** — joriy filtr bo'yicha (5000 gacha).

## 2) Inline admin menyu
- Tezroq navigatsiya: har bir ekranda "⬅️ Menyu" va "🔄 Yangilash".
- Yangi shortcut'lar: 📥 **Loglar ZIP**, 🧾 **Audit**, 📤 **CSV eksport**.
- Buyruqlar: `/admin`, `/orders`, `/find`, `/clearfilter`, `/monitoring`,
  `/errors`, `/queue`, `/health`, `/backups`, `/logzip`, `/audit`.

## 3) Loglar / monitoring — ZIP eksport
- Bot: 📥 tugma orqali yoki `/logzip`.
- Panel: `GET /api/admin/logs/export.zip`.
- Ichida: `logs_all.csv`, `logs_errors.csv`, `audit.csv`, `stats.json`, `README.txt`.

## 4) Restore — 2 bosqichli tasdiq
- 1-bosqich: "🔐 Tasdiqni boshlash" tugmasi (yoki `/restore FAYL`).
- 2-bosqich: bot 6 xonali kod yuboradi; admin `/confirm 123456` yozadi.
- Kod 5 daqiqa amal qiladi; "❌ Bekor qilish" tugmasi mavjud.
- Barcha bosqichlar auditga tushadi: `restore.step1`, `restore.confirm.request`,
  `restore.confirm.ok`, `restore.confirm.wrong_code`, `restore.execute[.fail]`.

## 5) Audit jurnal (kim, qachon, nima)
- Yangi jadval: `audit_log(ts, actor_type, actor_id, actor_name, action, target, ip, meta)`.
- Yozuvlar: bot menyusi, filtrlar, eksportlar, zaxira/tiklash, navbat amallari, .db yuklash.
- Ko'rish: bot — 🧾 Audit ekrani; panel — `GET /api/admin/audit`.
- Eksport: 📥 Audit ZIP tugmasi (yoki bot menyusidan).

## Telefon raqami orqali admin kirish
- `admin_users.login` maydonini telefon (masalan `+998901234567`) qilib saqlang.
- Panel login formasi shu login+parolni oddiy tarzda qabul qiladi.
- Superadmin `admin_users` jadvaliga panel orqali (Adminlar bo'limi) yangi
  telefon-loginli admin qo'shishi mumkin.

## Yangi fayllar
- `server/src/audit.js` — audit jurnal.
- `server/src/zip.js` — dependency'siz ZIP yozuvchi (STORE + DEFLATE).
- `server/src/bot_admin.js` — yangi ekranlar/tugmalar bilan qayta yozildi.
- `server/src/api.js` — `/admin/audit` va `/admin/logs/export.zip` qo'shildi.
