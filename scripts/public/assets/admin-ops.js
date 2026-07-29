// Admin Panel — Monitoring, Zaxira (Backup) va Adminlar (RBAC) bo'limlari
import { h } from "https://esm.sh/preact@10.22.0";
import { useState, useEffect } from "https://esm.sh/preact@10.22.0/hooks";
import htm from "https://esm.sh/htm@3.1.1";
const html = htm.bind(h);

const LS_TOKEN = "admin_token";
const getToken = () => localStorage.getItem(LS_TOKEN);

export async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      Authorization: "Bearer " + getToken(),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem(LS_TOKEN);
    location.reload();
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || "Xatolik");
  return data;
}

const ts = (t) => (t ? new Date(t * 1000).toLocaleString("ru-RU") : "—");
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : (n / 1024).toFixed(1) + " KB");

const LEVEL_STYLE = {
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
  debug: "bg-gray-100 text-gray-600",
};

/* ============================ MONITORING ============================ */
export function MonitoringTab() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState({ rows: [], total: 0 });
  const [jobs, setJobs] = useState({ rows: [], stats: {} });
  const [f, setF] = useState({ level: "", source: "", q: "" });
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState("logs");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      qs.set("limit", "200");
      const [s, l, hh, j] = await Promise.all([
        api("/admin/logs/stats"),
        api("/admin/logs?" + qs.toString()),
        api("/admin/health"),
        api("/admin/retry?limit=100"),
      ]);
      setStats(s);
      setLogs(l);
      setHealth(hh);
      setJobs(j);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [f.level, f.source, f.q]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [auto, f.level, f.source, f.q]);

  const clearLogs = async () => {
    if (!confirm("Barcha loglar o'chirilsinmi?")) return;
    await api("/admin/logs", { method: "DELETE" });
    load();
  };
  const requeue = async (id) => {
    await api(`/admin/retry/${id}/requeue`, { method: "POST" });
    load();
  };
  const dropJob = async (id) => {
    await api(`/admin/retry/${id}`, { method: "DELETE" });
    load();
  };
  const runNow = async () => {
    await api("/admin/retry/run", { method: "POST" });
    load();
  };

  const lv = stats?.last24h?.byLevel || {};
  const cards = [
    ["❌ Xatolar (24s)", lv.error || 0, "bg-red-500"],
    ["⚠️ Ogohlantirish", lv.warn || 0, "bg-amber-500"],
    ["🔁 Navbatda", jobs.stats?.pending || 0, "bg-blue-500"],
    ["💀 Muvaffaqiyatsiz", jobs.stats?.dead || 0, "bg-gray-700"],
  ];
  const maxH = Math.max(1, ...(stats?.last24h?.byHour || []).map((x) => x.total));

  return html`
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">🩺 Monitoring</h1>
        <div class="flex items-center gap-2">
          <label class="text-sm flex items-center gap-1 bg-white px-3 py-2 rounded-lg">
            <input type="checkbox" checked=${auto} onChange=${(e) => setAuto(e.target.checked)} /> Avto-yangilash
          </label>
          <button onClick=${load} class="bg-blue-600 text-white px-4 py-2 rounded-lg">🔄 Yangilash</button>
        </div>
      </div>
      ${err && html`<div class="bg-red-100 text-red-700 rounded-xl p-3 mb-4">${err}</div>`}

      <div class="grid grid-cols-4 gap-4 mb-4">
        ${cards.map(
          ([l, v, c]) => html`
            <div key=${l} class="${c} text-white rounded-2xl p-4">
              <div class="text-sm opacity-80">${l}</div>
              <div class="text-3xl font-bold mt-1">${v}</div>
            </div>`
        )}
      </div>

      ${health &&
      html`<div class="bg-white rounded-2xl p-4 mb-4 grid grid-cols-5 gap-3 text-sm">
        <div><div class="text-gray-500">Uptime</div><b>${Math.floor(health.uptime / 60)} min</b></div>
        <div><div class="text-gray-500">Xotira</div><b>${health.memory_mb} MB</b></div>
        <div><div class="text-gray-500">Baza hajmi</div><b>${kb(health.db_size)}</b></div>
        <div><div class="text-gray-500">Zaxiralar</div><b>${health.backups}</b></div>
        <div><div class="text-gray-500">Node</div><b>${health.node}</b></div>
      </div>`}

      <div class="bg-white rounded-2xl p-4 mb-4">
        <h2 class="font-semibold mb-3">So'nggi 24 soat faolligi</h2>
        <div class="flex items-end gap-1 h-28">
          ${(stats?.last24h?.byHour || []).map(
            (x) => html`
              <div key=${x.h} class="flex-1 flex flex-col justify-end h-full" title="${x.h}: ${x.total} (xato: ${x.errors})">
                <div class="w-full bg-red-500 rounded-t" style="height:${(x.errors / maxH) * 100}%"></div>
                <div class="w-full bg-blue-400" style="height:${((x.total - x.errors) / maxH) * 100}%"></div>
              </div>`
          )}
        </div>
      </div>

      <div class="flex gap-2 mb-3">
        ${[["logs", "📜 Loglar"], ["queue", "🔁 Qayta urinish navbati"], ["logins", "🔐 Kirishlar"]].map(
          ([k, l]) => html`<button key=${k} onClick=${() => setView(k)}
            class="px-4 py-2 rounded-lg ${view === k ? "bg-gray-900 text-white" : "bg-white"}">${l}</button>`
        )}
      </div>

      ${view === "logs" &&
      html`<div class="bg-white rounded-2xl overflow-hidden">
        <div class="p-3 flex gap-2 border-b">
          <select value=${f.level} onChange=${(e) => setF({ ...f, level: e.target.value })} class="border rounded-lg px-3 py-2">
            <option value="">Barcha darajalar</option>
            ${(stats?.levels || []).map((l) => html`<option key=${l} value=${l}>${l}</option>`)}
          </select>
          <select value=${f.source} onChange=${(e) => setF({ ...f, source: e.target.value })} class="border rounded-lg px-3 py-2">
            <option value="">Barcha manbalar</option>
            ${(stats?.sources || []).map((s) => html`<option key=${s} value=${s}>${s}</option>`)}
          </select>
          <input value=${f.q} onInput=${(e) => setF({ ...f, q: e.target.value })} placeholder="Qidiruv…" class="border rounded-lg px-3 py-2 flex-1" />
          <button onClick=${clearLogs} class="text-red-600 px-3">🗑 Tozalash</button>
        </div>
        <div class="max-h-[520px] overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-100 text-left sticky top-0"><tr>
              <th class="p-2">Vaqt</th><th class="p-2">Daraja</th><th class="p-2">Manba</th><th class="p-2">Xabar</th><th class="p-2">Ma'lumot</th>
            </tr></thead>
            <tbody>
              ${logs.rows.map(
                (r) => html`<tr key=${r.id} class="border-t align-top">
                  <td class="p-2 whitespace-nowrap text-gray-500">${ts(r.ts)}</td>
                  <td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs ${LEVEL_STYLE[r.level] || ""}">${r.level}</span></td>
                  <td class="p-2 font-mono text-xs">${r.source}</td>
                  <td class="p-2">${r.message}${r.ref_id ? html`<span class="text-gray-400"> · #${r.ref_id}</span>` : ""}</td>
                  <td class="p-2 font-mono text-xs text-gray-500 max-w-xs truncate" title=${r.meta || ""}>${r.meta || ""}</td>
                </tr>`
              )}
              ${!logs.rows.length && html`<tr><td class="p-4 text-gray-400" colspan="5">Log yo'q</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="p-3 text-sm text-gray-500 border-t">Jami: ${logs.total}</div>
      </div>`}

      ${view === "queue" &&
      html`<div class="bg-white rounded-2xl overflow-hidden">
        <div class="p-3 border-b flex gap-2 items-center">
          <span class="text-sm text-gray-500">Navbatda: ${jobs.stats?.pending || 0} · Bajarilgan: ${jobs.stats?.done || 0} · Muvaffaqiyatsiz: ${jobs.stats?.dead || 0}</span>
          <div class="flex-1"></div>
          <button onClick=${runNow} class="bg-blue-600 text-white px-4 py-2 rounded-lg">▶️ Hoziroq ishga tushirish</button>
          <button onClick=${async () => { await api("/admin/retry/clear", { method: "POST" }); load(); }} class="px-3 text-gray-600">🧹 Tugaganlarni tozalash</button>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr>
            <th class="p-2">#</th><th class="p-2">Turi</th><th class="p-2">Holat</th><th class="p-2">Urinish</th>
            <th class="p-2">Keyingi</th><th class="p-2">Xato</th><th></th>
          </tr></thead>
          <tbody>
            ${(jobs.rows || []).map(
              (j) => html`<tr key=${j.id} class="border-t">
                <td class="p-2">${j.id}</td>
                <td class="p-2 font-mono text-xs">${j.kind}</td>
                <td class="p-2">${{ pending: "⏳ kutmoqda", done: "✅ bajarildi", dead: "💀 muvaffaqiyatsiz" }[j.status] || j.status}</td>
                <td class="p-2">${j.attempts}/${j.max_attempts}</td>
                <td class="p-2 text-gray-500">${ts(j.next_at)}</td>
                <td class="p-2 text-red-600 max-w-xs truncate" title=${j.last_error || ""}>${j.last_error || ""}</td>
                <td class="p-2 text-right whitespace-nowrap">
                  <button onClick=${() => requeue(j.id)} class="text-blue-600 mr-2">🔁</button>
                  <button onClick=${() => dropJob(j.id)} class="text-red-500">🗑</button>
                </td>
              </tr>`
            )}
            ${!(jobs.rows || []).length && html`<tr><td class="p-4 text-gray-400" colspan="7">Navbat bo'sh 🎉</td></tr>`}
          </tbody>
        </table>
      </div>`}

      ${view === "logins" &&
      html`<div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr><th class="p-2">Vaqt</th><th class="p-2">Login</th><th class="p-2">Natija</th><th class="p-2">IP</th></tr></thead>
          <tbody>
            ${(health?.logins || []).map(
              (l) => html`<tr key=${l.id} class="border-t">
                <td class="p-2">${ts(l.ts)}</td><td class="p-2 font-mono">${l.login}</td>
                <td class="p-2">${l.ok ? "✅ muvaffaqiyatli" : "❌ rad etildi"}</td>
                <td class="p-2 text-gray-500">${l.ip || "—"}</td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>`}
    </div>`;
}

/* ============================== BACKUP ============================== */
export function BackupTab({ session }) {
  const [items, setItems] = useState([]);
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    api("/admin/backups")
      .then((r) => {
        setItems(r.items);
        setDir(r.dir);
      })
      .catch((e) => setErr(e.message));
  useEffect(load, []);

  const create = async () => {
    setBusy("create");
    setErr("");
    try {
      const r = await api("/admin/backups", { method: "POST" });
      setMsg(`Zaxira yaratildi: ${r.name}`);
      load();
    } catch (e) {
      setErr(e.message);
    }
    setBusy("");
  };

  const restore = async (name) => {
    if (!confirm(`DIQQAT!\n\n"${name}" zaxirasidan tiklansinmi?\nJoriy baza avval avtomatik nusxalanadi, so'ng server qayta ishga tushadi.`)) return;
    setBusy(name);
    setErr("");
    try {
      const r = await api(`/admin/backups/${name}/restore`, { method: "POST" });
      setMsg(r.message || "Tiklandi");
      setTimeout(() => location.reload(), 8000);
    } catch (e) {
      setErr(e.message);
    }
    setBusy("");
  };

  const del = async (name) => {
    if (!confirm(`${name} o'chirilsinmi?`)) return;
    await api(`/admin/backups/${name}`, { method: "DELETE" });
    load();
  };

  const download = (name) => {
    const a = document.createElement("a");
    fetch(`/api/admin/backups/${name}/download`, { headers: { Authorization: "Bearer " + getToken() } })
      .then((r) => r.blob())
      .then((b) => {
        a.href = URL.createObjectURL(b);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const onUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/backups/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) setErr(data.error || "Yuklashda xato");
    else {
      setMsg(`Yuklandi: ${data.name}`);
      load();
    }
    setBusy("");
  };

  const canRestore = session?.role === "superadmin";

  return html`
    <div>
      <h1 class="text-2xl font-bold mb-4">💾 Zaxira va tiklash</h1>
      ${msg && html`<div class="bg-green-100 text-green-800 rounded-xl p-3 mb-3">${msg}</div>`}
      ${err && html`<div class="bg-red-100 text-red-700 rounded-xl p-3 mb-3">${err}</div>`}

      <div class="bg-white rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <button onClick=${create} disabled=${busy === "create"} class="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
          ${busy === "create" ? "Yaratilmoqda…" : "➕ Hozir zaxira olish"}
        </button>
        <label class="bg-gray-900 text-white px-4 py-2 rounded-lg cursor-pointer">
          ⬆️ .db faylni yuklash
          <input type="file" accept=".db" class="hidden" onChange=${(e) => onUpload(e.target.files[0])} />
        </label>
        <span class="text-sm text-gray-500">Papka: <code>${dir}</code></span>
      </div>

      ${!canRestore &&
      html`<div class="bg-amber-100 text-amber-800 rounded-xl p-3 mb-3 text-sm">
        Tiklash faqat <b>superadmin</b> rolida mavjud.
      </div>`}

      <div class="bg-white rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr>
            <th class="p-3">Fayl</th><th class="p-3">Turi</th><th class="p-3">Hajm</th><th class="p-3">Sana</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map(
              (b) => html`<tr key=${b.name} class="border-t">
                <td class="p-3 font-mono text-xs">${b.name}</td>
                <td class="p-3">${{ auto: "🕓 avto", manual: "👤 qo'lda", "pre-restore": "🛟 tiklashdan oldin", upload: "⬆️ yuklangan" }[b.reason] || b.reason}</td>
                <td class="p-3">${kb(b.size)}</td>
                <td class="p-3 text-gray-500">${ts(b.created_at)}</td>
                <td class="p-3 text-right whitespace-nowrap">
                  <button onClick=${() => download(b.name)} class="text-blue-600 mr-3">⬇️</button>
                  ${canRestore && html`<button onClick=${() => restore(b.name)} disabled=${busy === b.name} class="text-green-600 mr-3">♻️ Tiklash</button>`}
                  <button onClick=${() => del(b.name)} class="text-red-500">🗑</button>
                </td>
              </tr>`
            )}
            ${!items.length && html`<tr><td class="p-4 text-gray-400" colspan="5">Hali zaxira yo'q</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ============================== ADMINS ============================== */
const ROLE_LABEL = {
  superadmin: "👑 Superadmin",
  admin: "🛠 Admin",
  manager: "📦 Menejer",
  viewer: "👁 Kuzatuvchi",
};

export function AdminsTab({ session }) {
  const [items, setItems] = useState([]);
  const [permissions, setPerms] = useState([]);
  const [roleMap, setRoleMap] = useState({});
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");

  const load = () =>
    api("/admin/admins")
      .then((r) => {
        setItems(r.items);
        setPerms(r.permissions);
        setRoleMap(r.roles);
      })
      .catch((e) => setErr(e.message));
  useEffect(load, []);

  const empty = () => ({ login: "", password: "", name: "", role: "manager", extra_perms: [], active: true });

  const save = async () => {
    setErr("");
    try {
      if (edit.id) {
        const body = { name: edit.name, role: edit.role, extra_perms: edit.extra_perms, active: edit.active };
        if (edit.password) body.password = edit.password;
        await api(`/admin/admins/${edit.id}`, { method: "PUT", body });
      } else {
        await api("/admin/admins", { method: "POST", body: edit });
      }
      setEdit(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const del = async (u) => {
    if (!confirm(`${u.login} o'chirilsinmi?`)) return;
    try {
      await api(`/admin/admins/${u.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const togglePerm = (p) =>
    setEdit((e) => ({
      ...e,
      extra_perms: e.extra_perms.includes(p) ? e.extra_perms.filter((x) => x !== p) : [...e.extra_perms, p],
    }));

  return html`
    <div>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">🔐 Adminlar va rollar</h1>
        <button onClick=${() => setEdit(empty())} class="bg-blue-600 text-white px-4 py-2 rounded-lg">➕ Yangi admin</button>
      </div>
      ${err && html`<div class="bg-red-100 text-red-700 rounded-xl p-3 mb-3">${err}</div>`}

      <div class="bg-white rounded-2xl overflow-hidden mb-6">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left"><tr>
            <th class="p-3">Login</th><th class="p-3">Ism</th><th class="p-3">Rol</th>
            <th class="p-3">Ruxsatlar</th><th class="p-3">Holat</th><th class="p-3">Oxirgi kirish</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map(
              (u) => html`<tr key=${u.id} class="border-t">
                <td class="p-3 font-mono font-semibold">${u.login}${session?.login === u.login ? html`<span class="text-xs text-blue-600"> (siz)</span>` : ""}</td>
                <td class="p-3">${u.name}</td>
                <td class="p-3">${ROLE_LABEL[u.role] || u.role}</td>
                <td class="p-3 text-xs text-gray-500">${u.perms.length} ta${u.extra_perms.length ? ` (+${u.extra_perms.length})` : ""}</td>
                <td class="p-3">${u.active ? "✅ faol" : "🚫 o'chirilgan"}</td>
                <td class="p-3 text-gray-500">${ts(u.last_login)}</td>
                <td class="p-3 text-right whitespace-nowrap">
                  <button onClick=${() => setEdit({ ...u, password: "" })} class="text-blue-600 mr-3">✏️</button>
                  <button onClick=${() => del(u)} class="text-red-500">🗑</button>
                </td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>

      <div class="bg-white rounded-2xl p-4">
        <h2 class="font-semibold mb-2">Rollar matritsasi</h2>
        <div class="grid grid-cols-4 gap-3 text-sm">
          ${Object.entries(roleMap).map(
            ([r, ps]) => html`<div key=${r} class="border rounded-xl p-3">
              <div class="font-semibold mb-1">${ROLE_LABEL[r] || r}</div>
              <div class="text-xs text-gray-500">${ps.join(", ")}</div>
            </div>`
          )}
        </div>
      </div>

      ${edit &&
      html`<div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick=${(e) => e.target === e.currentTarget && setEdit(null)}>
        <div class="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
          <h2 class="text-xl font-bold mb-4">${edit.id ? "Adminni tahrirlash" : "Yangi admin"}</h2>
          ${!edit.id &&
          html`<input value=${edit.login} onInput=${(e) => setEdit({ ...edit, login: e.target.value })}
            placeholder="Login" class="w-full border rounded-lg px-3 py-2 mb-3" />`}
          <input value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })}
            placeholder="Ism" class="w-full border rounded-lg px-3 py-2 mb-3" />
          <input type="password" value=${edit.password || ""} onInput=${(e) => setEdit({ ...edit, password: e.target.value })}
            placeholder=${edit.id ? "Yangi parol (bo'sh qolsa o'zgarmaydi)" : "Parol (kamida 8 belgi)"}
            class="w-full border rounded-lg px-3 py-2 mb-3" />
          <select value=${edit.role} onChange=${(e) => setEdit({ ...edit, role: e.target.value })} class="w-full border rounded-lg px-3 py-2 mb-3">
            ${Object.keys(roleMap).map((r) => html`<option key=${r} value=${r}>${ROLE_LABEL[r] || r}</option>`)}
          </select>
          <div class="text-sm text-gray-500 mb-1">Rol ruxsatlari: ${(roleMap[edit.role] || []).join(", ")}</div>
          <div class="text-sm font-semibold mb-1 mt-3">Qo'shimcha ruxsatlar</div>
          <div class="flex flex-wrap gap-2 mb-3">
            ${permissions.map(
              (p) => html`<button key=${p} onClick=${() => togglePerm(p)}
                class="px-3 py-1 rounded-full text-xs border ${edit.extra_perms.includes(p) ? "bg-blue-600 text-white border-blue-600" : "bg-white"}">${p}</button>`
            )}
          </div>
          <label class="flex items-center gap-2 mb-4">
            <input type="checkbox" checked=${!!edit.active} onChange=${(e) => setEdit({ ...edit, active: e.target.checked })} /> Faol
          </label>
          <div class="flex gap-2">
            <button onClick=${save} class="bg-blue-600 text-white px-6 py-2 rounded-lg">Saqlash</button>
            <button onClick=${() => setEdit(null)} class="px-6 py-2 rounded-lg border">Bekor</button>
          </div>
        </div>
      </div>`}
    </div>`;
}

/* ========================= Parolni o'zgartirish ========================= */
export function PasswordCard() {
  const [form, setForm] = useState({ current: "", password: "" });
  const [msg, setMsg] = useState("");
  const submit = async () => {
    try {
      await api("/admin/me/password", { method: "POST", body: form });
      setMsg("✅ Parol yangilandi");
      setForm({ current: "", password: "" });
    } catch (e) {
      setMsg("❌ " + e.message);
    }
  };
  return html`
    <div class="bg-white rounded-2xl p-4 max-w-sm">
      <h2 class="font-semibold mb-3">Parolni o'zgartirish</h2>
      <input type="password" value=${form.current} onInput=${(e) => setForm({ ...form, current: e.target.value })}
        placeholder="Joriy parol" class="w-full border rounded-lg px-3 py-2 mb-2" />
      <input type="password" value=${form.password} onInput=${(e) => setForm({ ...form, password: e.target.value })}
        placeholder="Yangi parol" class="w-full border rounded-lg px-3 py-2 mb-2" />
      <button onClick=${submit} class="bg-blue-600 text-white px-4 py-2 rounded-lg">Saqlash</button>
      ${msg && html`<div class="text-sm mt-2">${msg}</div>`}
    </div>`;
}
