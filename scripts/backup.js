#!/usr/bin/env node
"use strict";
/** Qo'lda zaxira olish: node scripts/backup.js  (cron uchun ham mos) */
require("dotenv").config();
const backup = require("../server/src/backup");
backup
  .createBackup("manual", "cli")
  .then((b) => console.log("✅ Zaxira:", b.name, (b.size / 1024).toFixed(1) + " KB"))
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  });
