#!/usr/bin/env node
"use strict";
/**
 * CLI orqali zaxiradan tiklash:
 *   node scripts/restore.js                 → mavjud zaxiralar ro'yxati
 *   node scripts/restore.js <fayl nomi>     → tiklash
 * Diqqat: server to'xtatilgan holatda ishlating.
 */
require("dotenv").config();
const backup = require("../server/src/backup");

(async () => {
  const name = process.argv[2];
  const items = backup.listBackups();
  if (!name) {
    if (!items.length) return console.log("Zaxira yo'q. Papka:", backup.BACKUP_DIR);
    console.log("Mavjud zaxiralar (" + backup.BACKUP_DIR + "):");
    for (const b of items) console.log(` • ${b.name}  ${(b.size / 1024).toFixed(1)} KB  ${new Date(b.created_at * 1000).toLocaleString()}`);
    console.log("\nTiklash: node scripts/restore.js <fayl>");
    return;
  }
  const r = await backup.restoreBackup(name, "cli");
  console.log("✅ Tiklandi:", r.restored, "| xavfsizlik nusxasi:", r.safety);
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
