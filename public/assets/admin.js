// Admin Panel — Preact + htm
import { h, render } from "https://esm.sh/preact@10.22.0";
import { useState, useEffect, useCallback } from "https://esm.sh/preact@10.22.0/hooks";
import htm from "https://esm.sh/htm@3.1.1";
const html = htm.bind(h);
import { MonitoringTab, BackupTab, AdminsTab, PasswordCard } from "/assets/admin-ops.js";

const LS_TOKEN = "admin_token";
const getToken = () => localStorage.getItem(LS_TOKEN);
const setToken = (t) => localStorage.setItem(LS_TOKEN, t);
const clearToken = () => localStorage.removeItem(LS_TOKEN);

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: {
      ...(opts.body ? {"Content-Type":"application/json"} : {}),
      "Authorization": "Bearer " + getToken(),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { clearToken(); location.reload(); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function upload(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "Authorization": "Bearer " + getToken() },
    body: fd,
  });
  return (await res.json()).urls;
}

const fmt = (n) => (Number(n)||0).toLocaleString("ru-RU");
const LANGS = ["uz","ru","en","kk","tr","tg"];
const LANG_NAMES = {uz:"O'zbek",ru:"Русский",en:"English",kk:"Қазақша",tr:"Türkçe",tg:"Тоҷикӣ"};

function Login({onLogin}) {
  const [login, setL] = useState("");
  const [password, setP] = useState("");
  const [err, setE] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await (await fetch("/api/admin/login", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({login, password})})).json();
      if (r.token) { setToken(r.token); onLogin(); }
      else setE(r.error || "Login yoki parol noto'g'ri");
    } catch { setE("Xato"); }
  };
  return html`
    <div class="min-h-screen flex items-center justify-center p-4">
      <form onSubmit=${submit} class="bg-white rounded-2xl p-6 shadow-lg w-full max-w-sm">
        <h1 class="text-2xl font-bold mb-4">🔐 Admin</h1>
        <input value=${login} onInput=${e=>setL(e.target.value)} placeholder="Login" class="w-full border rounded-lg px-3 py-2 mb-3"/>
        <input type="password" value=${password} onInput=${e=>setP(e.target.value)} placeholder="Password" class="w-full border rounded-lg px-3 py-2 mb-3"/>
        ${err && html`<div class="text-red-500 text-sm mb-3">${err}</div>`}
        <button class="w-full bg-blue-600 text-white rounded-lg py-2 font-semibold">Kirish</button>
      </form>
    </div>`;
}

const ROLE_LABEL = {superadmin:"👑 Superadmin", admin:"🛠 Admin", manager:"📦 Menejer", viewer:"👁 Kuzatuvchi"};

// [tab kaliti, sarlavha, kerakli ruxsat]
const NAV = [
  ["dashboard", "📊 Dashboard", "dashboard"],
  ["products", "👕 Mahsulotlar", "products"],
  ["categories", "📂 Kategoriyalar", "categories"],
  ["orders", "📦 Buyurtmalar", "orders"],
  ["countries", "🌍 Davlatlar", "countries"],
  ["banners", "🖼 Bannerlar", "banners"],
  ["promo", "🎟 Promo-kodlar", "promo"],
  ["users", "👥 Foydalanuvchilar", "users"],
  ["monitoring", "🩺 Monitoring", "monitoring"],
  ["backup", "💾 Zaxira", "backup"],
  ["admins", "🔐 Adminlar", "admins"],
  ["account", "⚙️ Mening hisobim", null],
];

function can(session, perm) {
  if (!perm) return true;
  if (!session) return false;
  if (session.role === "superadmin") return true;
  return (session.perms || []).includes(perm);
}

function Sidebar({tab, setTab, session}) {
  const items = NAV.filter(([,,perm]) => can(session, perm));
  return html`
    <aside class="w-60 bg-gray-900 text-white min-h-screen p-4 space-y-1">
      <div class="text-xl font-bold mb-1">🛍 Shop Admin</div>
      <div class="text-xs text-gray-400 mb-4">${session?.name || session?.login} · ${ROLE_LABEL[session?.role] || session?.role || ""}</div>
      ${items.map(([k,l]) => html`
        <button key=${k} onClick=${()=>setTab(k)} class="w-full text-left px-3 py-2 rounded-lg ${tab===k?'bg-blue-600':'hover:bg-gray-800'}">${l}</button>`)}
      <button onClick=${()=>{clearToken();location.reload();}} class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800 mt-8">🚪 Chiqish</button>
    </aside>`;
}

function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(()=>{ api("/admin/stats").then(setS); }, []);
  if (!s) return html`<div>Yuklanmoqda...</div>`;
  const cards = [
    ["👥 Foydalanuvchilar", s.users, "bg-blue-500"],
    ["👕 Mahsulotlar", s.products, "bg-green-500"],
    ["📦 Buyurtmalar", s.orders, "bg-purple-500"],
    ["💰 Tushum", fmt(s.revenue), "bg-orange-500"],
  ];
  const maxRev = Math.max(...(s.byDay.map(d=>d.s)),1);
  return html`
    <div>
      <h1 class="text-2xl font-bold mb-4">Dashboard</h1>
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${cards.map(([l,v,c]) => html`
          <div key=${l} class="${c} text-white rounded-2xl p-4">
            <div class="text-sm opacity-80">${l}</div>
            <div class="text-3xl font-bold mt-1">${v}</div>
          </div>`)}
      </div>
      <div class="bg-white rounded-2xl p-4">
        <h2 class="font-semibold mb-3">Kunlik tushum (30 kun)</h2>
        <div class="flex items-end gap-1 h-40">
          ${[...s.byDay].reverse().map(d => html`
            <div key=${d.d} class="flex-1 flex flex-col items-center gap-1" title="${d.d}: ${fmt(d.s)}">
              <div class="w-full bg-blue-500 rounded-t" style="height:${(d.s/maxRev)*100}%"></div>
            </div>`)}
        </div>
      </div>
    </div>`;
}

function ProductsTab() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => { api("/admin/products").then(setItems); api("/admin/categories").then(setCats); };
  useEffect(load, []);
  const empty = () => ({category_id: cats[0]?.id || 1, price:0, stock:100, active:1, featured:0, sizes:"S,M,L,XL", colors:"", images:[]});
  const save = async () => {
    if (edit.id) await api(`/admin/products/${edit.id}`, {method:"PUT", body:edit});
    else await api("/admin/products", {method:"POST", body:edit});
    setEdit(null); load();
  };
  const del = async (id) => { if (!confirm("O'chirish?")) return; await api(`/admin/products/${id}`, {method:"DELETE"}); load(); };
  const onFiles = async (files) => {
    if (!files?.length) return;
    const urls = await upload(files);
    setEdit(e => ({...e, images: [...(e.images||[]), ...urls]}));
  };
  return html`
    <div>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">Mahsulotlar (${items.length})</h1>
        <button onClick=${()=>setEdit(empty())} class="bg-blue-600 text-white px-4 py-2 rounded-lg">➕ Yangi mahsulot</button>
      </div>
      <div class="grid grid-cols-4 gap-3">
        ${items.map(p => html`
          <div key=${p.id} class="bg-white rounded-xl overflow-hidden shadow">
            <div class="aspect-square bg-gray-100">
              ${p.images?.[0] && html`<img src=${p.images[0]} class="w-full h-full object-cover"/>`}
            </div>
            <div class="p-2">
              <div class="text-sm font-medium truncate">${p.name_uz}</div>
              <div class="text-xs text-gray-500">#${p.id} · ${p.brand||""}</div>
              <div class="flex justify-between items-center mt-1">
                <div class="font-bold">${fmt(p.price)}</div>
                <div class="flex gap-1">
                  <button onClick=${()=>setEdit({...p})} class="text-blue-600">✏️</button>
                  <button onClick=${()=>del(p.id)} class="text-red-500">🗑</button>
                </div>
              </div>
              ${!p.active && html`<div class="text-xs text-red-500">Nofaol</div>`}
              ${p.featured?html`<div class="text-xs text-yellow-600">⭐ Featured</div>`:null}
            </div>
          </div>`)}
      </div>

      ${edit && html`
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${e=>e.target===e.currentTarget && setEdit(null)}>
          <div class="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4">${edit.id?"Tahrirlash":"Yangi mahsulot"}</h2>
            <div class="space-y-3">
              <div>
                <label class="text-sm text-gray-600">Kategoriya</label>
                <select value=${edit.category_id} onChange=${e=>setEdit({...edit, category_id:Number(e.target.value)})} class="w-full border rounded-lg px-3 py-2">
                  ${cats.map(c => html`<option key=${c.id} value=${c.id}>${c.icon||""} ${c.name_uz}</option>`)}
                </select>
              </div>
              <div>
                <label class="text-sm text-gray-600">Nom (6 tilda)</label>
                <div class="grid grid-cols-2 gap-2">
                  ${LANGS.map(l => html`
                    <input key=${l} value=${edit[`name_${l}`]||""} onInput=${e=>setEdit({...edit,[`name_${l}`]:e.target.value})} placeholder="Nom (${LANG_NAMES[l]})" class="border rounded-lg px-3 py-2"/>
                  `)}
                </div>
              </div>
              <div>
                <label class="text-sm text-gray-600">Tavsif</label>
                <div class="grid grid-cols-2 gap-2">
                  ${LANGS.map(l => html`
                    <textarea key=${l} value=${edit[`desc_${l}`]||""} onInput=${e=>setEdit({...edit,[`desc_${l}`]:e.target.value})} placeholder="Tavsif (${LANG_NAMES[l]})" class="border rounded-lg px-3 py-2" rows="2"></textarea>
                  `)}
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div><label class="text-sm">Narx</label><input type="number" value=${edit.price} onInput=${e=>setEdit({...edit,price:Number(e.target.value)})} class="w-full border rounded-lg px-3 py-2"/></div>
                <div><label class="text-sm">Eski narx</label><input type="number" value=${edit.old_price||""} onInput=${e=>setEdit({...edit,old_price:Number(e.target.value)||null})} class="w-full border rounded-lg px-3 py-2"/></div>
                <div><label class="text-sm">Stock</label><input type="number" value=${edit.stock} onInput=${e=>setEdit({...edit,stock:Number(e.target.value)})} class="w-full border rounded-lg px-3 py-2"/></div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div><label class="text-sm">Brend</label><input value=${edit.brand||""} onInput=${e=>setEdit({...edit,brand:e.target.value})} class="w-full border rounded-lg px-3 py-2"/></div>
                <div><label class="text-sm">O'lchamlar</label><input value=${edit.sizes||""} onInput=${e=>setEdit({...edit,sizes:e.target.value})} placeholder="S,M,L,XL" class="w-full border rounded-lg px-3 py-2"/></div>
                <div><label class="text-sm">Ranglar</label><input value=${edit.colors||""} onInput=${e=>setEdit({...edit,colors:e.target.value})} placeholder="Red,Blue" class="w-full border rounded-lg px-3 py-2"/></div>
              </div>
              <div>
                <label class="text-sm">Rasmlar</label>
                <input type="file" multiple accept="image/*" onChange=${e=>onFiles(e.target.files)} class="w-full border rounded-lg px-3 py-2"/>
                <div class="flex gap-2 flex-wrap mt-2">
                  ${(edit.images||[]).map((u,i) => html`
                    <div key=${i} class="relative">
                      <img src=${u} class="w-20 h-20 object-cover rounded-lg"/>
                      <button onClick=${()=>setEdit({...edit, images: edit.images.filter((_,j)=>j!==i)})} class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
                    </div>`)}
                </div>
              </div>
              <div class="flex gap-4">
                <label class="flex items-center gap-2"><input type="checkbox" checked=${!!edit.active} onChange=${e=>setEdit({...edit,active:e.target.checked?1:0})}/> Faol</label>
                <label class="flex items-center gap-2"><input type="checkbox" checked=${!!edit.featured} onChange=${e=>setEdit({...edit,featured:e.target.checked?1:0})}/> ⭐ Featured</label>
              </div>
            </div>
            <div class="flex gap-2 mt-6">
              <button onClick=${save} class="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold">Saqlash</button>
              <button onClick=${()=>setEdit(null)} class="px-6 border rounded-lg">Bekor</button>
            </div>
          </div>
        </div>`}
    </div>`;
}

function CategoriesTab() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api("/admin/categories").then(setItems);
  useEffect(load, []);
  const empty = () => ({icon:"👕", sort:0, active:1});
  const save = async () => {
    if (edit.id) await api(`/admin/categories/${edit.id}`, {method:"PUT", body:edit});
    else await api("/admin/categories", {method:"POST", body:edit});
    setEdit(null); load();
  };
  const del = async (id) => { if(!confirm("O'chirish?"))return; await api(`/admin/categories/${id}`, {method:"DELETE"}); load(); };
  return html`
    <div>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">Kategoriyalar</h1>
        <button onClick=${()=>setEdit(empty())} class="bg-blue-600 text-white px-4 py-2 rounded-lg">➕ Qo'shish</button>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-100 text-left text-sm"><tr><th class="p-3">ID</th><th class="p-3">Icon</th><th class="p-3">Nom (UZ)</th><th class="p-3">Sort</th><th class="p-3">Faol</th><th></th></tr></thead>
          <tbody>
            ${items.map(c => html`
              <tr key=${c.id} class="border-t">
                <td class="p-3">${c.id}</td>
                <td class="p-3 text-2xl">${c.icon}</td>
                <td class="p-3">${c.name_uz}</td>
                <td class="p-3">${c.sort}</td>
                <td class="p-3">${c.active?"✅":"❌"}</td>
                <td class="p-3 text-right">
                  <button onClick=${()=>setEdit({...c})} class="text-blue-600 mr-2">✏️</button>
                  <button onClick=${()=>del(c.id)} class="text-red-500">🗑</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      ${edit && html`
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${e=>e.target===e.currentTarget && setEdit(null)}>
          <div class="bg-white rounded-2xl p-6 w-full max-w-2xl">
            <h2 class="text-xl font-bold mb-4">Kategoriya</h2>
            <div class="grid grid-cols-3 gap-2 mb-2">
              <input value=${edit.icon||""} onInput=${e=>setEdit({...edit,icon:e.target.value})} placeholder="Icon (emoji)" class="border rounded-lg px-3 py-2"/>
              <input type="number" value=${edit.sort} onInput=${e=>setEdit({...edit,sort:Number(e.target.value)})} placeholder="Sort" class="border rounded-lg px-3 py-2"/>
              <label class="flex items-center gap-2"><input type="checkbox" checked=${!!edit.active} onChange=${e=>setEdit({...edit,active:e.target.checked?1:0})}/> Faol</label>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${LANGS.map(l => html`
                <input key=${l} value=${edit[`name_${l}`]||""} onInput=${e=>setEdit({...edit,[`name_${l}`]:e.target.value})} placeholder="Nom (${LANG_NAMES[l]})" class="border rounded-lg px-3 py-2"/>`)}
            </div>
            <div class="flex gap-2 mt-6">
              <button onClick=${save} class="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold">Saqlash</button>
              <button onClick=${()=>setEdit(null)} class="px-6 border rounded-lg">Bekor</button>
            </div>
          </div>
        </div>`}
    </div>`;
}

function OrdersTab() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState(null);
  const load = () => api("/admin/orders").then(setItems);
  useEffect(load, []);
  const setStatus = async (id, status) => { await api(`/admin/orders/${id}/status`, {method:"POST", body:{status}}); load(); if (view) setView({...view, status}); };
  const statuses = ["new","paid","packing","shipping","delivered","cancelled"];
  const colors = {new:"bg-blue-500",paid:"bg-green-500",packing:"bg-yellow-500",shipping:"bg-purple-500",delivered:"bg-emerald-600",cancelled:"bg-gray-500"};
  return html`
    <div>
      <h1 class="text-2xl font-bold mb-4">Buyurtmalar (${items.length})</h1>
      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr><th class="p-3">#</th><th class="p-3">Mijoz</th><th class="p-3">Telefon</th><th class="p-3">Jami</th><th class="p-3">Status</th><th class="p-3">Sana</th><th></th></tr></thead>
          <tbody>
            ${items.map(o => html`
              <tr key=${o.id} class="border-t">
                <td class="p-3 font-bold">#${o.id}</td>
                <td class="p-3">${o.name}</td>
                <td class="p-3">${o.phone}</td>
                <td class="p-3 font-bold">${fmt(o.total)}</td>
                <td class="p-3"><span class="text-white text-xs px-2 py-1 rounded-full ${colors[o.status]||'bg-gray-500'}">${o.status}</span></td>
                <td class="p-3 text-gray-500">${new Date(o.created_at*1000).toLocaleString()}</td>
                <td class="p-3"><button onClick=${()=>setView(o)} class="text-blue-600">Ochish →</button></td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      ${view && html`
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${e=>e.target===e.currentTarget && setView(null)}>
          <div class="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 class="text-2xl font-bold mb-3">Buyurtma #${view.id}</h2>
            <div class="space-y-1 text-sm">
              <div><b>Mijoz:</b> ${view.name}</div>
              <div><b>Telefon:</b> ${view.phone}</div>
              <div><b>Manzil:</b> ${view.city}, ${view.address}</div>
              <div><b>To'lov:</b> ${view.payment}</div>
              ${view.note && html`<div><b>Izoh:</b> ${view.note}</div>`}
            </div>
            <h3 class="font-bold mt-4 mb-2">Mahsulotlar</h3>
            <div class="space-y-1 text-sm">
              ${JSON.parse(view.items_json).map((i,idx) => html`
                <div key=${idx} class="flex justify-between border-b py-1">
                  <span>${i.name} (${i.size||"-"}/${i.color||"-"}) × ${i.qty}</span>
                  <span>${fmt(i.price*i.qty)}</span>
                </div>`)}
            </div>
            <div class="mt-3 space-y-1 text-sm">
              <div class="flex justify-between"><span>Subtotal:</span><b>${fmt(view.subtotal)}</b></div>
              <div class="flex justify-between"><span>Yetkazish:</span><b>${fmt(view.shipping)}</b></div>
              ${view.discount>0 && html`<div class="flex justify-between text-green-600"><span>Chegirma:</span><b>-${fmt(view.discount)}</b></div>`}
              <div class="flex justify-between text-lg font-bold pt-2 border-t"><span>Jami:</span><span>${fmt(view.total)}</span></div>
            </div>
            <h3 class="font-bold mt-4 mb-2">Status</h3>
            <div class="flex gap-2 flex-wrap">
              ${statuses.map(s => html`
                <button key=${s} onClick=${()=>setStatus(view.id, s)} class="px-3 py-2 rounded-lg text-white text-sm ${colors[s]} ${view.status===s?'ring-4 ring-black/20':''}">${s}</button>`)}
            </div>
          </div>
        </div>`}
    </div>`;
}

function CountriesTab() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api("/admin/countries").then(setItems);
  useEffect(load, []);
  const empty = () => ({code:"", flag:"🌍", currency:"UZS", shipping_price:0, active:1});
  const save = async () => {
    if (edit.id) await api(`/admin/countries/${edit.id}`, {method:"PUT", body:edit});
    else await api("/admin/countries", {method:"POST", body:edit});
    setEdit(null); load();
  };
  const del = async (id) => { if(!confirm("O'chirish?"))return; await api(`/admin/countries/${id}`, {method:"DELETE"}); load(); };
  return html`
    <div>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">Davlatlar</h1>
        <button onClick=${()=>setEdit(empty())} class="bg-blue-600 text-white px-4 py-2 rounded-lg">➕ Qo'shish</button>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-100 text-left text-sm"><tr><th class="p-3">Bayroq</th><th class="p-3">Kod</th><th class="p-3">Nom</th><th class="p-3">Valyuta</th><th class="p-3">Yetkazish</th><th></th></tr></thead>
          <tbody>
            ${items.map(c => html`
              <tr key=${c.id} class="border-t">
                <td class="p-3 text-2xl">${c.flag}</td>
                <td class="p-3">${c.code}</td>
                <td class="p-3">${c.name_uz}</td>
                <td class="p-3">${c.currency}</td>
                <td class="p-3">${fmt(c.shipping_price)}</td>
                <td class="p-3 text-right">
                  <button onClick=${()=>setEdit({...c})} class="text-blue-600 mr-2">✏️</button>
                  <button onClick=${()=>del(c.id)} class="text-red-500">🗑</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      ${edit && html`
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${e=>e.target===e.currentTarget && setEdit(null)}>
          <div class="bg-white rounded-2xl p-6 w-full max-w-2xl">
            <h2 class="text-xl font-bold mb-4">Davlat</h2>
            <div class="grid grid-cols-4 gap-2 mb-3">
              <input value=${edit.code} onInput=${e=>setEdit({...edit,code:e.target.value.toUpperCase()})} placeholder="Kod (UZ)" class="border rounded-lg px-3 py-2"/>
              <input value=${edit.flag} onInput=${e=>setEdit({...edit,flag:e.target.value})} placeholder="🇺🇿" class="border rounded-lg px-3 py-2"/>
              <input value=${edit.currency} onInput=${e=>setEdit({...edit,currency:e.target.value})} placeholder="UZS" class="border rounded-lg px-3 py-2"/>
              <input type="number" value=${edit.shipping_price} onInput=${e=>setEdit({...edit,shipping_price:Number(e.target.value)})} placeholder="Yetkazish narxi" class="border rounded-lg px-3 py-2"/>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-3">
              ${LANGS.map(l => html`
                <input key=${l} value=${edit[`name_${l}`]||""} onInput=${e=>setEdit({...edit,[`name_${l}`]:e.target.value})} placeholder="Nom (${LANG_NAMES[l]})" class="border rounded-lg px-3 py-2"/>`)}
            </div>
            <label class="flex items-center gap-2"><input type="checkbox" checked=${!!edit.active} onChange=${e=>setEdit({...edit,active:e.target.checked?1:0})}/> Faol</label>
            <div class="flex gap-2 mt-6">
              <button onClick=${save} class="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold">Saqlash</button>
              <button onClick=${()=>setEdit(null)} class="px-6 border rounded-lg">Bekor</button>
            </div>
          </div>
        </div>`}
    </div>`;
}

function BannersTab() {
  const [items, setItems] = useState([]);
  const load = () => api("/admin/banners").then(setItems);
  useEffect(load, []);
  const add = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls = await upload(files);
    for (const u of urls) await api("/admin/banners", {method:"POST", body:{image:u, sort:0}});
    load();
  };
  const del = async (id) => { if(!confirm("O'chirish?"))return; await api(`/admin/banners/${id}`, {method:"DELETE"}); load(); };
  return html`
    <div>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">Bannerlar</h1>
        <label class="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer">
          ➕ Rasm yuklash
          <input type="file" multiple accept="image/*" onChange=${add} class="hidden"/>
        </label>
      </div>
      <div class="grid grid-cols-3 gap-4">
        ${items.map(b => html`
          <div key=${b.id} class="bg-white rounded-2xl overflow-hidden relative">
            <img src=${b.image} class="w-full aspect-video object-cover"/>
            <button onClick=${()=>del(b.id)} class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full">🗑</button>
          </div>`)}
      </div>
    </div>`;
}

function PromoTab() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({code:"", percent:10, active:1});
  const load = () => api("/admin/promo").then(setItems);
  useEffect(load, []);
  const add = async () => { await api("/admin/promo", {method:"POST", body:form}); setForm({code:"",percent:10,active:1}); load(); };
  const del = async (id) => { if(!confirm("O'chirish?"))return; await api(`/admin/promo/${id}`, {method:"DELETE"}); load(); };
  return html`
    <div>
      <h1 class="text-2xl font-bold mb-4">Promo-kodlar</h1>
      <div class="bg-white rounded-2xl p-4 mb-4 flex gap-2">
        <input value=${form.code} onInput=${e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="CODE" class="border rounded-lg px-3 py-2 flex-1"/>
        <input type="number" value=${form.percent} onInput=${e=>setForm({...form,percent:Number(e.target.value)})} placeholder="%" class="border rounded-lg px-3 py-2 w-24"/>
        <button onClick=${add} class="bg-blue-600 text-white px-6 rounded-lg">Qo'shish</button>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-100 text-left"><tr><th class="p-3">Kod</th><th class="p-3">%</th><th class="p-3">Faol</th><th></th></tr></thead>
          <tbody>
            ${items.map(p => html`
              <tr key=${p.id} class="border-t">
                <td class="p-3 font-mono font-bold">${p.code}</td>
                <td class="p-3">${p.percent}%</td>
                <td class="p-3">${p.active?"✅":"❌"}</td>
                <td class="p-3 text-right"><button onClick=${()=>del(p.id)} class="text-red-500">🗑</button></td>
              </tr>`)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function UsersTab() {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const load = () => api("/admin/users").then(setItems);
  useEffect(load, []);
  const toggleBlock = async (u) => { await api(`/admin/users/${u.tg_id}/block`, {method:"POST", body:{blocked: !u.blocked}}); load(); };
  const broadcast = async () => {
    if (!msg.trim() || !confirm(`${items.length} ta foydalanuvchiga xabar yuborilsinmi?`)) return;
    setSending(true);
    const r = await api("/admin/broadcast", {method:"POST", body:{text:msg}});
    alert(`Yuborildi: ${r.sent}/${r.total}`);
    setSending(false); setMsg("");
  };
  return html`
    <div>
      <h1 class="text-2xl font-bold mb-4">Foydalanuvchilar (${items.length})</h1>
      <div class="bg-white rounded-2xl p-4 mb-4">
        <h3 class="font-semibold mb-2">📢 Mass-xabar</h3>
        <textarea value=${msg} onInput=${e=>setMsg(e.target.value)} placeholder="Xabar matni (HTML mumkin)" class="w-full border rounded-lg px-3 py-2" rows="3"></textarea>
        <button onClick=${broadcast} disabled=${sending} class="mt-2 bg-purple-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">${sending?"Yuborilmoqda...":"Hammaga yuborish"}</button>
      </div>
      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr><th class="p-3">ID</th><th class="p-3">Ism</th><th class="p-3">Username</th><th class="p-3">Til</th><th class="p-3">Telefon</th><th></th></tr></thead>
          <tbody>
            ${items.map(u => html`
              <tr key=${u.tg_id} class="border-t ${u.blocked?'bg-red-50':''}">
                <td class="p-3">${u.tg_id}</td>
                <td class="p-3">${u.first_name||""} ${u.last_name||""}</td>
                <td class="p-3">@${u.username||"-"}</td>
                <td class="p-3">${u.lang}</td>
                <td class="p-3">${u.phone||"-"}</td>
                <td class="p-3 text-right"><button onClick=${()=>toggleBlock(u)} class=${u.blocked?"text-green-600":"text-red-500"}>${u.blocked?"✅ Ochish":"🚫 Bloklash"}</button></td>
              </tr>`)}
          </tbody>
        </table>
      </div>
    </div>`;
}

function AdminApp({session}) {
  const first = (NAV.find(([,,p]) => can(session, p)) || ["dashboard"])[0];
  const [tab, setTab] = useState(first);
  const allowed = can(session, (NAV.find(([k]) => k === tab) || [])[2]);
  return html`
    <div class="flex">
      <${Sidebar} tab=${tab} setTab=${setTab} session=${session}/>
      <main class="flex-1 p-6 min-h-screen">
        ${!allowed && html`<div class="bg-red-100 text-red-700 rounded-xl p-4">Bu bo'limga ruxsatingiz yo'q.</div>`}
        ${allowed && tab==="dashboard" && html`<${Dashboard}/>`}
        ${allowed && tab==="products" && html`<${ProductsTab}/>`}
        ${allowed && tab==="categories" && html`<${CategoriesTab}/>`}
        ${allowed && tab==="orders" && html`<${OrdersTab}/>`}
        ${allowed && tab==="countries" && html`<${CountriesTab}/>`}
        ${allowed && tab==="banners" && html`<${BannersTab}/>`}
        ${allowed && tab==="promo" && html`<${PromoTab}/>`}
        ${allowed && tab==="users" && html`<${UsersTab}/>`}
        ${allowed && tab==="monitoring" && html`<${MonitoringTab}/>`}
        ${allowed && tab==="backup" && html`<${BackupTab} session=${session}/>`}
        ${allowed && tab==="admins" && html`<${AdminsTab} session=${session}/>`}
        ${allowed && tab==="account" && html`
          <div>
            <h1 class="text-2xl font-bold mb-4">⚙️ Mening hisobim</h1>
            <div class="bg-white rounded-2xl p-4 mb-4 max-w-sm text-sm">
              <div><b>Login:</b> ${session?.login}</div>
              <div><b>Rol:</b> ${ROLE_LABEL[session?.role] || session?.role}</div>
              <div class="mt-2"><b>Ruxsatlar:</b> ${(session?.perms||[]).join(", ")}</div>
            </div>
            <${PasswordCard}/>
          </div>`}
      </main>
    </div>`;
}

function Root() {
  const [logged, setLogged] = useState(!!getToken());
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const loadSession = useCallback(() => {
    setLoading(true);
    api("/admin/session")
      .then((s) => { setSession(s); setLogged(true); })
      .catch(() => { clearToken(); setLogged(false); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (getToken()) loadSession(); }, []);

  if (!logged) return html`<${Login} onLogin=${loadSession}/>`;
  if (loading || !session) return html`<div class="min-h-screen flex items-center justify-center text-gray-500">Yuklanmoqda…</div>`;
  return html`<${AdminApp} session=${session}/>`;
}

render(html`<${Root}/>`, document.getElementById("root"));
