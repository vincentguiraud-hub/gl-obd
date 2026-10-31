"use strict";
/* global diag, S, $, $$, esc, fmt, toast, busy, cleanErr, modal, confirmBox, needConn, go, store, searchUrl */

const A = { mod: null, tab: "infos", info: null, dids: [], vals: {}, prev: {}, changed: new Set(), meas: [], measOn: false, rec: [], hist: {}, labels: {}, coding: null, codingOrig: null, selByte: 0, dtcs: [] };
diag.labels().then((l) => (A.labels = l || {}));

const hexToBytes = (h) => (h.replace(/[^0-9a-f]/gi, "").match(/../g) || []).map((x) => parseInt(x, 16));
const bytesHex = (b) => b.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const modKey = () => (A.info && (A.info.find((x) => x.did === "F187") || {}).text) || (A.mod && A.mod.addr) || "?";
const lab = (did) => A.labels[modKey() + ":" + did] || {};
function setLab(did, patch) {
  const k = modKey() + ":" + did;
  A.labels[k] = { ...(A.labels[k] || {}), ...patch };
  diag.saveLabels(A.labels);
}
const at = (op, ...args) => diag.atelier(op, A.mod, ...args);

// ---------- choix du calculateur ----------
function atModules() {
  // calculateurs qui ont répondu en premier, puis les autres
  const list = [...S.modules];
  list.sort((a, b) => (S.vag[b.addr]?.reachable ? 1 : 0) - (S.vag[a.addr]?.reachable ? 1 : 0));
  return list;
}
function fillModSelect() {
  const sel = $("#atMod");
  sel.innerHTML = atModules().map((m) => `<option value="${esc(m.addr)}">${esc(m.addr)} – ${esc(m.name)}${S.vag[m.addr]?.reachable === false ? " (absent)" : S.vag[m.addr]?.systemName ? " · " + esc(S.vag[m.addr].systemName) : ""}</option>`).join("");
  if (A.mod) sel.value = A.mod.addr;
}
function openAtelier(addr) {
  fillModSelect();
  if (addr) $("#atMod").value = addr;
  selectAtMod($("#atMod").value);
  go("atelier");
}
window.openAtelier = openAtelier;
function selectAtMod(addr) {
  stopMeas();
  A.mod = S.modules.find((m) => m.addr === addr) || null;
  A.info = null; A.dids = []; A.vals = {}; A.prev = {}; A.changed = new Set(); A.coding = null; A.dtcs = [];
  A.meas = []; A.hist = {};
  $("#didTable tbody").innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px">Lance une exploration : le logiciel interroge chaque numéro et affiche toutes les valeurs que le calculateur donne.</td></tr>`;
  $("#atDtcDet").innerHTML = `<div class="empty">Clique sur un défaut pour voir ses détails.</div>`;
  $("#measTiles").innerHTML = "";
  showTab(A.tab, true);
}
$("#atMod").onchange = () => selectAtMod($("#atMod").value);
$("#atRefresh").onclick = () => showTab(A.tab, true);
$$("#atTabs a").forEach((a) => (a.onclick = () => showTab(a.dataset.tab)));
document.querySelector('#nav a[data-page=atelier]').addEventListener("click", () => { if (!A.mod) openAtelier(); else fillModSelect(); });

function showTab(t, reload) {
  A.tab = t;
  $$("#atTabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === t));
  $$("#page-atelier .tab").forEach((d) => d.classList.toggle("hidden", d.id !== "tab-" + t));
  if (!A.mod || !S.connected) { if (t === "infos") $("#tab-infos").innerHTML = `<div class="empty">${S.connected ? "Choisis un calculateur." : "Connecte-toi d'abord à l'adaptateur."}</div>`; return; }
  if (t === "infos" && (reload || !A.info)) loadInfos();
  if (t === "dtc" && (reload || !A.dtcLoaded)) loadDtcs();
  if (t === "coding" && (reload || !A.coding)) loadCoding();
  if (t === "meas") renderMeasTiles();
}

// ---------- identification ----------
async function loadInfos() {
  const box = $("#tab-infos");
  box.innerHTML = `<div class="empty"><span class="spin" style="border-top-color:var(--orange)"></span>Lecture de la fiche du calculateur…</div>`;
  try {
    A.info = await at("identification");
    box.innerHTML = A.info.length ? `<div class="card"><div class="kv">${A.info.filter((x) => x.did !== "0600").map((x) => `<div><span>${esc(x.name)} <small class="muted">${x.did}</small></span><b>${esc(x.text)}</b></div>`).join("")}</div>
      ${A.info.find((x) => x.did === "0600") ? `<p class="muted">Ce calculateur a un codage long : onglet « Codage ».</p>` : ""}</div>`
      : `<div class="empty">Ce calculateur ne répond pas.</div>`;
  } catch (e) { box.innerHTML = `<p class="err">${esc(cleanErr(e))}</p>`; }
}

// ---------- défauts détaillés ----------
async function loadDtcs() {
  const box = $("#atDtcList");
  box.innerHTML = `<div class="empty"><span class="spin" style="border-top-color:var(--orange)"></span>Lecture…</div>`;
  try {
    A.dtcs = await at("allDtcs");
    A.dtcLoaded = true;
    box.innerHTML = (A.dtcs.length ? A.dtcs.map((d, i) => `<div class="dtc ${d.status.active ? "" : "warn"}" data-i="${i}" style="cursor:pointer"><div class="code">${esc(d.code)}</div><div class="desc"><b>${esc(d.description || d.category)}${d.ftbText ? " – " + esc(d.ftbText) : ""}</b><small>${esc(d.status.label)}</small></div></div>`).join("")
      : `<div class="verdict ok" style="margin-top:0"><span class="big">✓</span><div><b>Aucun défaut</b>Aucun défaut mémorisé dans ce calculateur.</div></div>`) +
      `<div class="row mt"><button class="btn ghost" id="atDtcReload">Relire</button><button class="btn danger" id="atDtcClear">Effacer les défauts de ce calculateur</button></div>`;
    $$("#atDtcList .dtc").forEach((el) => (el.onclick = () => dtcDetail(A.dtcs[+el.dataset.i])));
    $("#atDtcReload").onclick = () => loadDtcs();
    $("#atDtcClear").onclick = async () => {
      if (!await confirmBox("Effacer les défauts ?", `<p>${esc(A.mod.name)} – contact mis, moteur arrêté.</p>`, "Effacer")) return;
      busy($("#atDtcClear"), async () => { await diag.vagClear(A.mod); toast("Défauts effacés"); loadDtcs(); }).catch(() => {});
    };
  } catch (e) { box.innerHTML = `<p class="err">${esc(cleanErr(e))}</p>`; }
}
function valueLine(v) {
  const parts = [];
  if (v.ascii) parts.push(`texte « ${esc(v.ascii)} »`);
  for (const k of ["u8", "u16", "u24", "u32"]) if (v[k] !== undefined) parts.push(`${v[k].toLocaleString("fr-FR")}`);
  if (v.s16 !== undefined && v.s16 < 0) parts.push(`signé ${v.s16}`);
  return parts.join(" · ");
}
async function dtcDetail(d) {
  const box = $("#atDtcDet");
  box.innerHTML = `<h2>${esc(d.code)}</h2><p class="muted"><span class="spin" style="border-top-color:var(--orange)"></span>Lecture des conditions d'apparition…</p>`;
  let det;
  try { det = await at("dtcDetails", d.raw3); } catch (e) { box.innerHTML += `<p class="err">${esc(cleanErr(e))}</p>`; return; }
  const snap = det.snapshots.map((s) => s.items.map((it) => `<tr><td class="mono">${s.record}</td><td class="mono">${it.did}</td><td>${esc(lab(it.did).name || it.name || "Valeur enregistrée")}</td><td class="mono">${esc(it.hex)}</td><td>${valueLine(it)}</td></tr>`).join("")).join("");
  const ext = det.extended.map((x) => `<tr><td class="mono">${x.record}</td><td class="mono">${esc(x.hex)}</td><td>${x.first !== undefined ? `Premier octet : <b>${x.first}</b> (souvent le compteur d'apparitions)` : ""}</td></tr>`).join("");
  box.innerHTML = `<div class="row between"><h2>${esc(d.code)}</h2><button class="btn link" data-url="${esc(searchUrl(d.spn !== undefined ? `SPN ${d.spn} FMI ${d.fmi}` : d.base, d.description))}">Rechercher ↗</button></div>
    <p><b>${esc(d.description || d.category)}</b>${d.ftbText ? " – " + esc(d.ftbText) : ""}</p>
    <h2 class="mt">État du défaut</h2><div class="statusbits">${det.statusBits.map((b) => `<div class="${b.on ? "on" : ""}">${esc(b.label)}</div>`).join("")}</div>
    <h2 class="mt">Conditions au moment du défaut</h2>
    ${snap ? `<table class="tbl"><thead><tr><th>Enr.</th><th>N°</th><th>Valeur</th><th>Brut</th><th>Lecture</th></tr></thead><tbody>${snap}</tbody></table><p class="muted small">Kilométrage, date, tension, régime… enregistrés par le calculateur. Sans les fichiers constructeur VW, l'échelle exacte de chaque valeur n'est pas connue : plusieurs lectures sont proposées.</p>` : `<p class="muted">${esc(det.snapErr || "Aucune donnée enregistrée.")}</p>`}
    <h2 class="mt">Données complémentaires</h2>
    ${ext ? `<table class="tbl"><thead><tr><th>Enr.</th><th>Brut</th><th>Lecture</th></tr></thead><tbody>${ext}</tbody></table>` : `<p class="muted">${esc(det.extErr || "Aucune.")}</p>`}`;
}

// ---------- codage ----------
async function loadCoding() {
  const box = $("#tab-coding");
  box.innerHTML = `<div class="empty"><span class="spin" style="border-top-color:var(--orange)"></span>Lecture du codage…</div>`;
  try {
    const b = await at("readCoding");
    A.coding = [...b]; A.codingOrig = [...b]; A.selByte = 0;
    renderCoding();
  } catch (e) { box.innerHTML = `<div class="empty">${esc(cleanErr(e))}</div>`; }
}
function renderCoding() {
  const box = $("#tab-coding"), c = A.coding, o = A.codingOrig, i = A.selByte;
  const changed = c.some((x, k) => x !== o[k]);
  const bitNames = lab("0600:" + i).bits || [];
  box.innerHTML = `<div class="card">
    <div class="row between"><h2>Codage long – ${c.length} octets</h2><div class="row"><button class="btn ghost" id="codReload">Relire</button><button class="btn ghost" id="codCopy">Copier</button></div></div>
    <input id="codHex" class="mono" value="${bytesHex(c)}">
    <div class="bytes">${c.map((x, k) => `<button data-b="${k}" class="${k === i ? "sel" : ""} ${x !== o[k] ? "chg" : ""}">${x.toString(16).toUpperCase().padStart(2, "0")}<small>octet ${k}</small></button>`).join("")}</div>
  </div>
  <div class="card"><h2>Octet ${i} : ${c[i].toString(16).toUpperCase().padStart(2, "0")} (binaire ${c[i].toString(2).padStart(8, "0")})</h2>
    <div class="bitgrid">${[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => `<label class="${c[i] & (1 << bit) ? "on" : ""}">Bit ${bit}<input type="checkbox" data-bit="${bit}" ${c[i] & (1 << bit) ? "checked" : ""}><input class="lbl" data-bitname="${bit}" value="${esc(bitNames[bit] || "")}" placeholder="nom…" style="font-size:11px;margin-top:4px;padding:3px"></label>`).join("")}</div>
    <p class="muted small">Tu peux nommer chaque bit (ex. « feux de jour ») : les noms sont mémorisés pour ce calculateur.</p>
  </div>
  <div class="card"><h2>Écrire le codage</h2>
    ${changed ? `<p>Modifications : ${c.map((x, k) => (x !== o[k] ? `octet ${k} : ${o[k].toString(16).toUpperCase().padStart(2, "0")} → <b>${x.toString(16).toUpperCase().padStart(2, "0")}</b>` : null)).filter(Boolean).join(" · ")}</p>` : `<p class="muted">Aucune modification.</p>`}
    <div class="row"><input id="codLogin" class="mono" placeholder="Code d'accès (si demandé)" style="width:220px"><button class="btn primary" id="codWrite" ${changed ? "" : "disabled"}>Écrire dans le calculateur</button><button class="btn ghost" id="codUndo" ${changed ? "" : "disabled"}>Annuler les modifications</button></div>
    <p class="muted small">Une sauvegarde du codage d'origine est enregistrée automatiquement dans Documents › G&amp;L Diag › Sauvegardes avant chaque écriture.</p>
  </div>`;
  $$("#tab-coding .bytes button").forEach((b) => (b.onclick = () => { A.selByte = +b.dataset.b; renderCoding(); }));
  $$("#tab-coding [data-bit]").forEach((cb) => (cb.onchange = () => { A.coding[i] ^= 1 << +cb.dataset.bit; renderCoding(); }));
  $$("#tab-coding [data-bitname]").forEach((inp) => (inp.onchange = () => { const arr = [...(lab("0600:" + i).bits || [])]; arr[+inp.dataset.bitname] = inp.value; setLab("0600:" + i, { bits: arr }); }));
  $("#codHex").onchange = () => {
    const b = hexToBytes($("#codHex").value);
    if (b.length !== o.length) { toast(`Le codage doit faire ${o.length} octets.`, true); renderCoding(); return; }
    A.coding = b; renderCoding();
  };
  $("#codReload").onclick = () => loadCoding();
  $("#codCopy").onclick = () => { navigator.clipboard.writeText(bytesHex(c).replace(/ /g, "")); toast("Codage copié"); };
  $("#codUndo").onclick = () => { A.coding = [...o]; renderCoding(); };
  $("#codWrite").onclick = () => writeWithBackup("0600", "Codage long", o, c, $("#codLogin").value.trim(), $("#codWrite"), loadCoding);
}

async function writeWithBackup(did, name, oldB, newB, login, btn, after) {
  const ok = await confirmBox(`Écrire ${name} ?`, `<p><b>${esc(A.mod.addr)} – ${esc(A.mod.name)}</b></p>
    <p class="mono small">Avant : ${bytesHex(oldB)}<br>Après : ${bytesHex(newB)}</p>
    <ul><li>Contact mis, moteur arrêté, batterie en bon état (chargeur conseillé).</li><li>Ne débranche pas l'adaptateur pendant l'écriture.</li><li>Une sauvegarde de la valeur actuelle est faite automatiquement.</li></ul>`, "Écrire");
  if (!ok) return;
  await busy(btn, async () => {
    const file = await diag.backup({ date: new Date().toISOString(), vin: S.info?.vin, addr: A.mod.addr, module: `${A.mod.addr} ${A.mod.name}`, part: modKey(), did, login: login || undefined, before: bytesHex(oldB), after: bytesHex(newB) });
    await at("writeDid", did, newB, login ? { login } : {});
    toast("Écriture réussie ✓ (sauvegarde : " + file.split(/[\\/]/).pop() + ")");
    if (after) await after();
  }).catch(() => {});
}

// ---------- toutes les valeurs ----------
$("#didRange").onchange = () => { const c = $("#didRange").value === "custom"; $("#didCustom").classList.toggle("hidden", !c); $("#didCustom2").classList.toggle("hidden", !c); };
diag.on("scan-progress", ({ p, did, n }) => {
  const pr = $("#didProg");
  pr.firstElementChild.style.width = Math.round(p * 100) + "%";
  pr.lastElementChild.textContent = did ? `Numéro ${did} · ${n} valeur(s) trouvée(s)` : `Terminé · ${n} valeur(s)`;
});
$("#didScan").onclick = () => {
  if (!needConn() || !A.mod) return;
  let [from, to] = $("#didRange").value === "custom" ? [$("#didFrom").value, $("#didTo").value] : $("#didRange").value.split("-");
  from = parseInt(from, 16); to = parseInt(to, 16);
  if (!(from >= 0 && to >= from && to <= 0xffff)) return toast("Plage invalide (hexadécimal, ex. 0400 à 04FF).", true);
  $("#didProg").classList.remove("hidden"); $("#didStop").classList.remove("hidden");
  S.working = true;
  busy($("#didScan"), async () => {
    const found = await diag.scanDids(A.mod, from, to);
    for (const f of found) { const i = A.dids.findIndex((x) => x.did === f.did); if (i >= 0) A.dids[i] = f; else A.dids.push(f); }
    A.dids.sort((a, b) => a.did.localeCompare(b.did));
    for (const f of found) A.vals[f.did] = f;
    renderDids();
    toast(`${found.length} valeur(s) trouvée(s)`);
  }).catch(() => {}).finally(() => { S.working = false; $("#didStop").classList.add("hidden"); setTimeout(() => $("#didProg").classList.add("hidden"), 1500); });
};
$("#didStop").onclick = () => diag.cancelScan();
$("#didFilter").oninput = () => renderDids();
$("#didChangedOnly").onchange = () => renderDids();
$("#didRefresh").onclick = () => busy($("#didRefresh"), async () => {
  const v = await at("readMany", A.dids.map((d) => ({ did: d.did, len: d.len })));
  for (const [did, x] of Object.entries(v)) { if (A.vals[did] && A.vals[did].hex !== x.hex) A.changed.add(did); A.prev[did] = A.vals[did]; A.vals[did] = x; }
  renderDids();
}).catch(() => {});
function numText(v) {
  for (const k of ["u8", "u16", "u24", "u32"]) if (v[k] !== undefined) return v[k].toLocaleString("fr-FR") + (v[k.replace("u", "s")] !== undefined && v[k.replace("u", "s")] < 0 ? ` (${v[k.replace("u", "s")]})` : "");
  return "";
}
function renderDids() {
  const q = $("#didFilter").value.trim().toLowerCase(), only = $("#didChangedOnly").checked;
  const rows = A.dids.filter((d) => {
    const v = A.vals[d.did] || d, name = lab(d.did).name || d.name || "";
    if (only && !A.changed.has(d.did)) return false;
    return !q || `${d.did} ${name} ${v.hex} ${v.ascii || ""}`.toLowerCase().includes(q);
  });
  $("#didTable tbody").innerHTML = rows.map((d) => {
    const v = A.vals[d.did] || d, p = A.prev[d.did];
    const hex = p && p.hex !== v.hex ? v.hex.split(" ").map((x, i) => (p.hex.split(" ")[i] !== x ? `<span class="hl">${x}</span>` : x)).join(" ") : esc(v.hex);
    return `<tr class="${A.changed.has(d.did) ? "moved" : ""}"><td><input type="checkbox" data-meas="${d.did}" ${A.meas.includes(d.did) ? "checked" : ""} title="Suivre en direct" style="width:auto"></td>
      <td class="mono">${d.did}</td><td><input class="lbl" data-name="${d.did}" value="${esc(lab(d.did).name || d.name || "")}" placeholder="—"></td>
      <td class="mono">${hex}</td><td>${esc(v.ascii || "")}</td><td>${numText(v)}</td><td><button class="btn link" data-edit="${d.did}">Modifier</button></td></tr>`;
  }).join("") || `<tr><td colspan="7" class="muted" style="padding:20px">Aucune valeur.</td></tr>`;
  $$("#didTable [data-name]").forEach((i) => (i.onchange = () => setLab(i.dataset.name, { name: i.value })));
  $$("#didTable [data-meas]").forEach((c) => (c.onchange = () => { const did = c.dataset.meas; A.meas = c.checked ? [...A.meas, did] : A.meas.filter((x) => x !== did); renderMeasTiles(); }));
  $$("#didTable [data-edit]").forEach((b) => (b.onclick = () => editDid(b.dataset.edit)));
}
async function editDid(did) {
  const v = A.vals[did];
  const res = await modal(`Modifier la valeur ${did}`, `<p>${esc(lab(did).name || "Valeur " + did)}</p><label>Nouvelle valeur (hexadécimal, ${v.len} octet${v.len > 1 ? "s" : ""})<input id="edHex" class="mono" value="${esc(v.hex)}"></label><label>Code d'accès (si demandé)<input id="edLogin" class="mono"></label><p class="muted small">Modifier une adaptation sans connaître sa signification peut dérégler le véhicule. Une sauvegarde est faite automatiquement.</p>`,
    [{ label: "Annuler", value: null }, { label: "Continuer", value: "go", cls: "primary" }]);
  if (!res) return;
  const nb = hexToBytes($("#edHex").value), login = $("#edLogin").value.trim();
  if (nb.length !== v.len) return toast(`Il faut exactement ${v.len} octet(s).`, true);
  const btn = document.querySelector(`[data-edit="${did}"]`);
  writeWithBackup(did, "la valeur " + did, hexToBytes(v.hex), nb, login, btn, async () => { const x = await at("did", did); if (x) { A.prev[did] = A.vals[did]; A.vals[did] = x; A.changed.add(did); } renderDids(); });
}
$("#didCsv").onclick = async () => {
  if (!A.dids.length) return toast("Lance d'abord une exploration.", true);
  const lines = ["N°;Nom;Hex;Texte;Nombre", ...A.dids.map((d) => { const v = A.vals[d.did] || d; return [d.did, lab(d.did).name || d.name || "", v.hex, v.ascii || "", numText(v)].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"); })];
  const f = await diag.saveText({ text: lines.join("\r\n"), name: `Valeurs ${A.mod.addr} ${modKey()}.csv`, ext: "csv" });
  if (f) toast("Enregistré");
};

// ---------- mesures en direct ----------
const TYPES = { u8: "8 bits", s8: "±8 bits", u16: "16 bits", s16: "±16 bits", u24: "24 bits", u32: "32 bits", s32: "±32 bits", ascii: "Texte" };
function measValue(did) {
  const v = A.vals[did]; if (!v) return null;
  const L = lab(did);
  const t = L.type && v[L.type] !== undefined ? L.type : ["u8", "u16", "u24", "u32", "ascii"].find((k) => v[k] !== undefined);
  if (!t) return null;
  if (t === "ascii") return v.ascii;
  return v[t] * (L.factor ?? 1) + (L.offset ?? 0);
}
function renderMeasTiles() {
  $("#measTiles").innerHTML = A.meas.map((did) => {
    const L = lab(did), v = A.vals[did] || {};
    return `<div class="tile" id="mt-${did}"><div class="n">${esc(L.name || "Valeur")} <span class="muted">${did}</span></div><div class="v"><span>—</span><small>${esc(L.unit || "")}</small></div><canvas width="400" height="80"></canvas>
      <div class="scale"><select data-type="${did}">${Object.entries(TYPES).filter(([k]) => v[k] !== undefined).map(([k, n]) => `<option value="${k}" ${L.type === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <input data-factor="${did}" value="${L.factor ?? 1}" title="Multiplicateur" size="5"><input data-offset="${did}" value="${L.offset ?? 0}" title="Décalage" size="4"><input data-unit="${did}" value="${esc(L.unit || "")}" placeholder="unité" size="5"></div></div>`;
  }).join("") || `<div class="empty">Aucune valeur suivie.</div>`;
  $$("#measTiles [data-type]").forEach((e) => (e.onchange = () => { setLab(e.dataset.type, { type: e.value }); drawMeas(); }));
  $$("#measTiles [data-factor]").forEach((e) => (e.onchange = () => { setLab(e.dataset.factor, { factor: parseFloat(e.value.replace(",", ".")) || 1 }); A.hist = {}; drawMeas(); }));
  $$("#measTiles [data-offset]").forEach((e) => (e.onchange = () => { setLab(e.dataset.offset, { offset: parseFloat(e.value.replace(",", ".")) || 0 }); A.hist = {}; drawMeas(); }));
  $$("#measTiles [data-unit]").forEach((e) => (e.onchange = () => { setLab(e.dataset.unit, { unit: e.value }); renderMeasTiles(); }));
  drawMeas();
}
function drawMeas() {
  for (const did of A.meas) {
    const el = $("#mt-" + did); if (!el) continue;
    const val = measValue(did);
    el.querySelector(".v span").textContent = val === null ? "—" : typeof val === "string" ? val : fmt(val, Math.abs(val) < 10 && val % 1 ? 2 : val % 1 ? 1 : 0);
    const h = A.hist[did] || [];
    const c = el.querySelector("canvas"), g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (h.length < 2) continue;
    const mn = Math.min(...h), mx = Math.max(...h, mn + 1e-9);
    g.beginPath();
    h.forEach((v, i) => { const x = (i / 119) * c.width, y = c.height - 4 - ((v - mn) / (mx - mn)) * (c.height - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = "#e8771e"; g.lineWidth = 3; g.stroke();
  }
}
function stopMeas() { A.measOn = false; $("#measStart").textContent = "▶ Démarrer"; $("#measStart").classList.add("primary"); }
$("#measStart").onclick = async () => {
  if (A.measOn) return stopMeas();
  if (!needConn()) return;
  if (!A.meas.length) return toast("Coche d'abord des valeurs dans « Toutes les valeurs ».", true);
  A.measOn = true; A.rec = [];
  $("#measStart").textContent = "■ Arrêter"; $("#measStart").classList.remove("primary");
  while (A.measOn) {
    const t0 = performance.now();
    let v;
    try { v = await at("readMany", A.meas.map((did) => ({ did, len: (A.vals[did] || {}).len }))); } catch (e) { toast(cleanErr(e), true); stopMeas(); break; }
    const row = { t: new Date() };
    for (const [did, x] of Object.entries(v)) {
      A.vals[did] = x;
      const n = measValue(did);
      if (typeof n === "number") { (A.hist[did] = A.hist[did] || []).push(n); if (A.hist[did].length > 120) A.hist[did].shift(); }
      row[did] = n;
    }
    A.rec.push(row);
    drawMeas();
    $("#measRate").textContent = `${(1000 / (performance.now() - t0)).toFixed(1)} lectures/s`;
    await new Promise((r) => setTimeout(r, 30));
  }
};
$("#measCsv").onclick = async () => {
  if (!A.rec.length) return toast("Lance d'abord une mesure.", true);
  const head = ["Heure", ...A.meas.map((d) => `${lab(d).name || d} (${lab(d).unit || ""})`)];
  const lines = [head.join(";"), ...A.rec.map((r) => [r.t.toLocaleTimeString("fr-FR") + "," + String(r.t.getMilliseconds()).padStart(3, "0"), ...A.meas.map((d) => (r[d] === undefined || r[d] === null ? "" : String(r[d]).replace(".", ",")))].join(";"))];
  const f = await diag.saveText({ text: lines.join("\r\n"), name: `Mesures ${A.mod.addr} ${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}.csv`, ext: "csv" });
  if (f) toast("Enregistré");
};

// ---------- commandes avancées ----------
$$("[data-sess]").forEach((b) => (b.onclick = () => needConn() && busy(b, async () => toast("Session : " + (await at("session", +b.dataset.sess)))).catch(() => {})));
$("#loginBtn").onclick = () => needConn() && busy($("#loginBtn"), async () => {
  const code = $("#loginCode").value.trim();
  if (!/^\d+$/.test(code)) throw new Error("Le code doit être un nombre.");
  toast("Accès : " + (await at("login", +code, +$("#loginLevel").value)));
}).catch(() => {});
$("#resetBtn").onclick = async () => {
  if (!needConn()) return;
  if (!await confirmBox("Redémarrer le calculateur ?", `<p>${esc(A.mod.name)} va redémarrer (comme un débranchement de batterie). Moteur arrêté.</p>`, "Redémarrer")) return;
  busy($("#resetBtn"), async () => { await at("reset", 1); toast("Calculateur redémarré"); }).catch(() => {});
};
$$("[data-rt]").forEach((b) => (b.onclick = async () => {
  if (!needConn()) return;
  const id = $("#rtId").value.replace(/\s/g, "").toUpperCase();
  if (!/^[0-9A-F]{4}$/.test(id)) return toast("Numéro de routine : 4 caractères hexadécimaux (ex. 0183).", true);
  if (b.dataset.rt === "1" && !await confirmBox("Lancer la routine " + id + " ?", "<p>Une routine peut actionner des organes du véhicule (moteurs, vannes, ventilateurs…). Reste à distance des pièces mobiles.</p>", "Lancer", "primary")) return;
  busy(b, async () => {
    try { const r = await at("routine", id, +b.dataset.rt, $("#rtData").value.replace(/\s/g, "")); $("#rtOut").textContent = `Réponse : ${r.raw}\nRésultat : ${r.result}`; }
    catch (e) { $("#rtOut").textContent = cleanErr(e); }
  });
}));
async function sendUds() {
  if (!needConn()) return;
  const h = $("#udsRaw").value.replace(/\s/g, "");
  if (!/^([0-9a-fA-F]{2})+$/.test(h)) return toast("Saisis des octets en hexadécimal (ex. 22F190).", true);
  if (/^(2E|31|11|14|27|28|2F|34|35|36|37|3D|85)/i.test(h) && !await confirmBox("Envoyer une commande qui modifie le calculateur ?", `<p class="mono">${esc(h)}</p>`, "Envoyer")) return;
  const r = await at("raw", h);
  $("#udsOut").textContent = `> ${h.toUpperCase()}\n${r.ok ? r.hex + (r.ascii ? `\n« ${r.ascii} »` : "") : r.text}\n\n` + $("#udsOut").textContent;
}
$("#udsSend").onclick = sendUds;
$("#udsRaw").addEventListener("keydown", (e) => { if (e.key === "Enter") sendUds(); });

// ---------- tests antipollution détaillés (mode 06 / 09) ----------
$("#obdPlusBtn").onclick = () => needConn() && busy($("#obdPlusBtn"), async () => {
  const m6 = await diag.mode06();
  const m9 = await diag.mode09();
  S.mode06 = m6; S.mode09 = m9;
  const bad = m6.filter((t) => !t.pass);
  const n = (v, u) => `${fmt(v, Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 3 : 1)}${u ? " " + esc(u) : ""}`;
  $("#obdPlusOut").innerHTML = (m6.length ? `<div class="verdict ${bad.length ? "bad" : "ok"}"><span class="big">${bad.length ? "✗" : "✓"}</span><div><b>${bad.length ? bad.length + " test(s) hors limites" : "Tous les tests sont dans les limites"}</b>${m6.length} résultats de tests lus dans le calculateur moteur.</div></div>
    <div class="card flush"><table class="tbl"><thead><tr><th>Système testé</th><th>Test</th><th>Mesure</th><th>Min</th><th>Max</th><th>Résultat</th></tr></thead><tbody>${m6.map((t) => `<tr><td>${esc(t.name)}</td><td class="mono">${t.tid.toString(16).toUpperCase().padStart(2, "0")}</td><td><b>${n(t.value, t.unit)}</b></td><td>${n(t.min, t.unit)}</td><td>${n(t.max, t.unit)}</td><td><span class="badge ${t.pass ? "ok" : "bad"}">${t.pass ? "OK" : "Hors limites"}</span></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">Le calculateur moteur ne donne pas de résultats de tests (mode 06).</div>`) +
    (m9.iupr ? `<h2 class="mt">Fréquence de réalisation des tests (IUPR, ${m9.iupr.type})</h2><div class="card flush"><table class="tbl"><thead><tr><th>Surveillance</th><th>Tests réalisés</th><th>Occasions</th><th>Ratio</th></tr></thead><tbody>${m9.iupr.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.comp ?? ""}</td><td>${r.cond ?? ""}</td><td>${r.ratio === null || r.ratio === undefined ? "" : `<span class="badge ${r.ratio >= 0.336 ? "ok" : r.ratio >= 0.1 ? "warn" : "bad"}">${fmt(r.ratio, 2)}</span>`}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Un ratio bas signifie que le calculateur a rarement pu faire le test (trajets trop courts, par exemple). Seuil réglementaire habituel : 0,336.</p>` : "") +
    (m9.calids.length ? `<h2 class="mt">Logiciel moteur homologué</h2><div class="card"><div class="kv">${m9.calids.map((c, i) => `<div><span>Identifiant d'étalonnage (CALID)</span><b>${esc(c.text)}</b></div>${m9.cvns[i] ? `<div><span>Somme de contrôle (CVN)</span><b>${esc(m9.cvns[i].hex)}</b></div>` : ""}`).join("")}</div><p class="muted small">Le CVN change si le logiciel moteur a été modifié (reprogrammation).</p></div>` : "");
}).catch(() => {});

// ---------- espion CAN ----------
const SN = { on: false, ids: new Map(), log: [], t0: 0 };
function stopSniff() { SN.on = false; $("#sniffBtn").textContent = "▶ Écouter"; $("#sniffBtn").classList.add("primary"); }
$("#sniffBtn").onclick = async () => {
  if (SN.on) return stopSniff();
  if (!needConn()) return;
  SN.on = true; SN.ids = new Map(); SN.log = []; SN.t0 = Date.now();
  $("#sniffBtn").textContent = "■ Arrêter"; $("#sniffBtn").classList.remove("primary");
  while (SN.on) {
    let frames;
    try { frames = await diag.sniff(700); } catch (e) { toast(cleanErr(e), true); stopSniff(); break; }
    const now = Date.now();
    for (const f of frames) {
      const e = SN.ids.get(f.id) || { n: 0, first: now, data: [], prev: [] };
      e.n++; e.prev = e.data; e.data = f.data; e.last = now;
      SN.ids.set(f.id, e);
      if (SN.log.length < 200000) SN.log.push([now - SN.t0, f.id, f.data]);
    }
    renderSniff();
    $("#sniffRate").textContent = `${frames.length} trames / 0,7 s`;
  }
};
$("#sniffFilter").oninput = () => renderSniff();
function renderSniff() {
  const q = $("#sniffFilter").value.trim().toUpperCase();
  const H = (b) => b.toString(16).toUpperCase().padStart(2, "0");
  const rows = [...SN.ids.entries()].filter(([id]) => !q || id.includes(q)).sort(([a], [b]) => a.localeCompare(b));
  $("#sniffTable tbody").innerHTML = rows.map(([id, e]) => {
    const hz = e.n / Math.max(0.7, (e.last - e.first) / 1000 + 0.7);
    const data = e.data.map((b, i) => (e.prev.length && e.prev[i] !== b ? `<span class="hl">${H(b)}</span>` : H(b))).join(" ");
    const txt = String.fromCharCode(...e.data.map((b) => (b >= 0x20 && b < 0x7f ? b : 0x2e)));
    return `<tr><td class="mono">${esc(id)}</td><td>${e.n}</td><td>${fmt(hz, 1)} Hz</td><td class="mono">${data}</td><td class="mono">${esc(txt)}</td></tr>`;
  }).join("") || `<tr><td colspan="5" class="muted" style="padding:20px">${SN.on ? "En écoute… aucune trame pour l'instant." : "Clique sur « Écouter »."}</td></tr>`;
}
$("#sniffCsv").onclick = async () => {
  if (!SN.log.length) return toast("Rien à exporter.", true);
  const lines = ["Temps (ms);Identifiant;Données", ...SN.log.map(([t, id, d]) => `${t};${id};${d.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}`)];
  const f = await diag.saveText({ text: lines.join("\r\n"), name: `Espion CAN ${new Date().toLocaleString("fr-FR").replace(/[/:]/g, "-")}.csv`, ext: "csv" });
  if (f) toast("Enregistré");
};

// ---------- export autoscan texte (style VCDS) ----------
$("#txtBtn").onclick = async () => {
  if (!S.info) return toast("Fais d'abord un diagnostic.", true);
  const e = currentEntry();
  const L = [];
  L.push("G&L Diag – Autoscan", "=".repeat(60), `Date : ${new Date(e.date).toLocaleString("fr-FR")}`, `VIN : ${e.vin || "—"}   ${[e.brand, e.year].filter(Boolean).join(" ")}`,
    `Client : ${e.client || "—"}   Kilométrage : ${e.km || "—"}`, `Tension : ${e.voltage ? e.voltage + " V" : "—"}   Protocole : ${e.protocol || "—"}`, "");
  const o = e.obd || {};
  L.push(e.truck ? "Défauts J1939 :" : "Défauts OBD moteur :");
  const all = [...(o.stored || []).map((d) => [d, "mémorisé"]), ...(o.pending || []).map((d) => [d, "en attente"]), ...(o.permanent || []).map((d) => [d, "permanent"]), ...(o.previous || []).map((d) => [d, "passé"])];
  L.push(...(all.length ? all.map(([d, k]) => `   ${d.code} – ${d.description || d.category} [${k}]`) : ["   Aucun"]), "");
  L.push("-".repeat(60));
  for (const m of e.modules) {
    L.push(`Adresse ${m.addr} : ${m.name}`);
    if (m.systemName) L.push(`   Système : ${m.systemName}`);
    if (m.partNumber) L.push(`   Référence : ${m.partNumber}   Logiciel : ${m.software || "—"}`);
    L.push(`   ${m.dtcs && m.dtcs.length ? m.dtcs.length + " défaut(s) :" : "Aucun défaut"}`);
    for (const d of m.dtcs || []) L.push(`   ${d.code} – ${d.description || d.category}${d.ftbText ? " – " + d.ftbText : ""}`, `      ${d.status ? d.status.label : ""}`);
    L.push("-".repeat(60));
  }
  L.push("Fin de l'autoscan");
  const f = await diag.saveText({ text: L.join("\r\n"), name: `Autoscan ${e.vin || ""} ${new Date(e.date).toLocaleDateString("fr-FR").replace(/\//g, "-")}.txt`, ext: "txt" });
  if (f) toast("Enregistré");
};
