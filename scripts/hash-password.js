// Admin parolini bcrypt hash qilish: npm run hash -- "MeningKuchliParolim"
const bcrypt = require("bcryptjs");
const pw = process.argv[2];
if (!pw) {
  console.log('Foydalanish: npm run hash -- "parol"');
  process.exit(1);
}
console.log("\nADMIN_PASSWORD_HASH=" + bcrypt.hashSync(pw, 12) + "\n");
