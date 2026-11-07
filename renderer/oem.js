"use strict";
/* global diag, S, $, $$, esc, fmt, toast, busy, cleanErr, needConn, store, A */

// ================= VALEURS CONSTRUCTEUR (base OBDb) =================
const OM = { index: null, id: null, year: null, cmds: [], sel: new Set(), vals: {}, live: false };
const omKey = (c, s) => `${c.key}|${s.id}`;
async function omInit() {
  if (!OM.index) OM.index = await diag.oemIndex();
  const sel = $("#oemVeh");
  if (!sel.options.length) {
    const byMake = {};
    for (const v of OM.index) (byMake[v.make] = byMake[v.make] || []).push(v);
    sel.innerHTML = Object.keys(byMake).sort().map((m) => `<optgroup label="${esc(m)}">${byMake[m].sort((a, b) => (a.model || "").localeCompare(b.model || "")).map((v) => `<option value="${esc(v.id)}">${esc(v.make)} ${esc(v.model || "(toutes / commun à la marque)")} · ${v.n} valeurs</option>`).join("")}</optgroup>`).join("");
  }
  const saved = store.get("oemVeh:" + (S.info?.vin || "?"), null);
  const id = saved || (S.connected ? await diag.oemGuess() : null) || OM.id || "Volkswagen-Crafter";
  $("#oemYear").value = store.get("oemYear:" + (S.info?.vin || "?"), S.info?.year || "");
  if (id) sel.value = id;
  await omLoad();
}
async function omLoad() {
  OM.id = $("#oemVeh").value; OM.year = parseInt($("#oemYear").value, 10) || null;
  store.set("oemVeh:" + (S.info?.vin || "?"), OM.id); store.set("oemYear:" + (S.info?.vin || "?"), OM.year);
  OM.cmds = await diag.oemSignals(OM.id, OM.year);
  OM.sel = new Set(store.get("oemSel:" + OM.id, []));
  const cats = [...new Set(OM.cmds.flatMap((c) => c.signals.map((s) => s.cat.split(" › ")[0])))].sort();
  $("#oemCat").innerHTML = `<option value="">Toutes</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
  omRender();
}
function omRows() {
  const q = $("#oemQ").value.trim().toLowerCase(), cat = $("#oemCat").value;
  const rows = [];
  for (const c of OM.cmds) for (const s of c.signals) {
    if (cat && !s.cat.startsWith(cat)) continue;
    if (q && !`${s.name} ${s.id} ${s.cat} ${c.hdr} ${c.did}`.toLowerCase().includes(q)) continue;
    rows.push([c, s]);
  }
  return rows;
}
function omValue(c, s) {
  const v = OM.vals[c.key]?.[s.id];
  if (!v) return OM.vals[c.key] ? `<span class="muted">—</span>` : "";
  if (v.text !== undefined && v.text !== null) return `<b>${esc(v.text)}</b>`;
  if (v.value === null || v.value === undefined) return `<span class="muted">pas de donnée</span>`;
  return `<b>${fmt(v.value, Number.isInteger(v.value) ? 0 : Math.abs(v.value) < 10 ? 2 : 1)}</b> ${esc(s.unit)}`;
}
function omModName(hdr) {
  const m = S.modules.find((x) => x.reqHex === hdr || x.addr === hdr);
  return m ? `${m.addr} ${m.name}` : hdr;
}
function omRender() {
  const rows = omRows();
  const shown = rows.slice(0, 400);
  $("#oemCount").textContent = `${rows.length} valeur(s)${rows.length > 400 ? " – 400 premières affichées, affine la recherche" : ""} · ${OM.sel.size} sélectionnée(s)`;
  $("#oemTable tbody").innerHTML = shown.map(([c, s]) => `<tr><td><input type="checkbox" data-om="${esc(omKey(c, s))}" ${OM.sel.has(omKey(c, s)) ? "checked" : ""} ${c.ok ? "" : "disabled title='Adressage non pris en charge'"} style="width:auto"></td>
    <td class="small">${esc(omModName(c.hdr))}<br><span class="muted mono">${esc(c.svc + c.did)}</span></td><td>${esc(s.name)}<br><span class="muted small mono">${esc(s.id)}</span></td><td class="small">${esc(s.cat)}</td><td id="omv-${esc(omKey(c, s)).replace(/[^\w-]/g, "_")}">${omValue(c, s)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted" style="padding:20px">Aucune valeur.</td></tr>`;
  $$("[data-om]").forEach((cb) => (cb.onchange = () => { cb.checked ? OM.sel.add(cb.dataset.om) : OM.sel.delete(cb.dataset.om); store.set("oemSel:" + OM.id, [...OM.sel]); $("#oemCount").textContent = `${rows.length} valeur(s) · ${OM.sel.size} sélectionnée(s)`; }));
}
function omUpdateValues() {
  for (const [c, s] of omRows().slice(0, 400)) { const el = document.getElementById("omv-" + omKey(c, s).replace(/[^\w-]/g, "_")); if (el) el.innerHTML = omValue(c, s); }
}
$("#oemVeh").onchange = () => omLoad();
$("#oemYear").onchange = () => omLoad();
$("#oemQ").oninput = () => omRender();
$("#oemCat").onchange = () => omRender();
diag.on("oem-progress", ({ p, txt }) => { const pr = $("#oemProg"); pr.firstElementChild.style.width = Math.round(p * 100) + "%"; pr.lastElementChild.textContent = txt ? `Lecture ${txt}` : "Terminé"; });
document.querySelector('#nav a[data-page=oem]').addEventListener("click", () => omInit().catch((e) => toast(cleanErr(e), true)));

$("#oemAll").onclick = () => needConn() && busy($("#oemAll"), async () => {
  // toutes les valeurs affichées (filtre en cours), calculateurs présents uniquement
  const absent = new Set(S.modules.filter((m) => S.vag[m.addr]?.reachable === false).map((m) => m.reqHex));
  const keys = [...new Set(omRows().map(([c]) => c).filter((c) => c.ok && !absent.has(c.hdr)).map((c) => c.key))];
  $("#oemProg").classList.remove("hidden"); S.working = true;
  try { const r = await diag.oemRead(OM.id, OM.year, keys); for (const k of keys) OM.vals[k] = r[k] || {}; }
  finally { S.working = false; setTimeout(() => $("#oemProg").classList.add("hidden"), 1200); }
  omUpdateValues();
  toast(`${Object.keys(OM.vals).length} groupe(s) de valeurs lus`);
}).catch(() => {});

$("#oemLive").onclick = async () => {
  if (OM.live) { OM.live = false; return; }
  if (!needConn()) return;
  const keys = [...new Set([...OM.sel].map((k) => k.split("|")[0]))];
  if (!keys.length) return toast("Coche d'abord des valeurs.", true);
  OM.live = true; S.working = true; $("#oemLive").textContent = "■ Arrêter"; $("#oemLive").classList.remove("primary");
  if (!$("#oemQ").value && !$("#oemCat").value) { /* affiche la sélection en tête */ }
  try {
    while (OM.live) {
      const t0 = performance.now();
      Object.assign(OM.vals, await diag.oemRead(OM.id, OM.year, keys));
      omUpdateValues();
      $("#oemRate").textContent = `${fmt(keys.length / ((performance.now() - t0) / 1000), 1)} lectures/s`;
    }
  } catch (e) { toast(cleanErr(e), true); }
  OM.live = false; S.working = false; $("#oemLive").textContent = "▶ Lire la sélection en continu"; $("#oemLive").classList.add("primary");
};
$("#oemCsv").onclick = async () => {
  const rows = omRows().filter(([c]) => OM.vals[c.key]);
  if (!rows.length) return toast("Lis d'abord des valeurs.", true);
  const lines = ["Calculateur;Numéro;Valeur;Catégorie;Mesure;Unité", ...rows.map(([c, s]) => { const v = OM.vals[c.key][s.id]; return [c.hdr, c.svc + c.did, s.name, s.cat, v ? (v.text ?? (v.value === null ? "" : String(v.value).replace(".", ","))) : "", s.unit].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"); })];
  const f = await diag.saveText({ text: lines.join("\r\n"), name: `Valeurs constructeur ${S.info?.vin || ""}.csv`, ext: "csv" });
  if (f) toast("Enregistré");
};

// Noms de la base pour l'Atelier (Toutes les valeurs) : « 7E0:22295A » -> nom
window.oemNameFor = (hdr, did) => {
  const c = OM.cmds.find((x) => x.hdr === hdr && x.did === did && x.svc === "22");
  return c ? c.signals.map((s) => s.name).join(" · ") : null;
};
