// Oddiy smoke-test: server API'lari ishlayaptimi (bot'siz).
const { execSync } = require("child_process");
const base = process.env.BASE || "http://localhost:3010";
const dev = { "x-dev-user": "111", "content-type": "application/json" };

async function main() {
  const j = async (p, o = {}) => {
    const r = await fetch(base + p, o);
    return [r.status, await r.json().catch(() => null)];
  };
  const out = [];
  out.push(["config", ...(await j("/api/config"))]);
  out.push(["home", ...(await j("/api/home"))]);
  out.push(["me", ...(await j("/api/me", { method: "POST", headers: dev }))]);
  out.push(["cart-bad", ...(await j("/api/cart/add", { method: "POST", headers: dev, body: JSON.stringify({ product_id: -1 }) }))]);
  out.push(["unauth", ...(await j("/api/cart"))]);
  out.push(["login-bad", ...(await j("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: "x", password: "y" }) }))]);
  for (const [n, s, b] of out) console.log(n.padEnd(12), s, JSON.stringify(b).slice(0, 120));
}
main();
