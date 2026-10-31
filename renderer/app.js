"use strict";
/* global diag, buildReport */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, dec = 1) => (v === undefined || v === null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const S = {
  connected: false, info: null, session: null,
  obd: null, readiness: null, freeze: null,
  modules: [], vag: {}, selected: null,
  pids: [], live: false, hist: {}, rec: [],
};

// ---------- utilitaires interface ----------
function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (bad ? " bad" : "");
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.add("hidden"), bad ? 6000 : 3000);
}
async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${old}`;
  try { return await fn(); } catch (e) { toast(cleanErr(e), true); throw e; } finally { btn.disabled = false; btn.innerHTML = old; }
}
const cleanErr = (e) => String(e && e.message || e).replace(/^Error invoking remote method 'api': (Error: )?/, "");
function modal(title, body, buttons) {
  return new Promise((resolve) => {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    const box = $("#modalBtns"); box.innerHTML = "";
    for (const b of buttons) {
      const el = document.createElement("button");
      el.className = "btn " + (b.cls || "ghost"); el.textContent = b.label;
      el.onclick = () => { $("#modal").classList.add("hidden"); resolve(b.value); };
      box.appendChild(el);
    }
    $("#modal").classList.remove("hidden");
  });
}
const confirmBox = (title, body, ok = "Confirmer", cls = "danger") => modal(title, body, [{ label: "Annuler", value: false }, { label: ok, value: true, cls }]);
function needConn() { if (!S.connected) { toast("Connecte-toi d'abord à l'adaptateur (page Connexion).", true); go("connexion"); return false; } return true; }
const searchUrl = (code, desc) => "https://www.google.com/search?q=" + encodeURIComponent(`${code} ${S.info?.brand || ""} ${desc || ""}`.trim());

// ---------- navigation ----------
function go(page) {
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("hidden", p.id !== "page-" + page));
  if (page === "rapports") renderHistory();
  if (page === "live" && S.connected && !S.pids.length) loadPids();
}
$$("#nav a").forEach((a) => (a.onclick = () => go(a.dataset.page)));

// ---------- connexion ----------
const HELP = {
  serial: `<h2>Câble USB (vLinker, OBDLink…)</h2><ol>
    <li>Branche le câble sur la prise OBD (sous le volant) puis sur le PC, et <b>mets le contact</b>.</li>
    <li>Windows installe le pilote tout seul (1 minute la première fois) et crée un <b>port COM</b>.</li>
    <li>Clique sur ↻ : le câble apparaît en premier dans la liste avec la mention USB.</li>
    <li>Clique sur <b>Se connecter</b> : la vitesse est trouvée automatiquement.</li></ol>
    <h2 class="mt">Adaptateur Bluetooth classique</h2><ol>
    <li>Branche l'adaptateur sur la prise OBD (sous le volant) et <b>mets le contact</b>.</li>
    <li>Sur le PC : <b>Paramètres → Bluetooth et appareils → Ajouter un appareil → Bluetooth</b>.</li>
    <li>Choisis l'adaptateur (« OBDII », « V-LINK », « OBD2 »…). Code demandé : <b>1234</b> (ou 0000, 6789).</li>
    <li>Windows crée alors un <b>port COM</b>. Clique sur ↻ à gauche : il apparaît avec la mention Bluetooth.</li>
    <li>Si Windows a créé deux ports COM pour l'adaptateur et que le premier ne répond pas, essaie l'autre.</li>
    <li>Clique sur <b>Se connecter</b>.</li></ol>`,
  wifi: `<h2>Adaptateur WiFi</h2><ol>
    <li>Branche l'adaptateur et <b>mets le contact</b>.</li>
    <li>Sur le PC, connecte-toi au réseau WiFi de l'adaptateur (« WiFi_OBDII », « V-LINK »…). Pas d'internet pendant ce temps, c'est normal.</li>
    <li>Laisse l'adresse <b>192.168.0.10</b> et le port <b>35000</b> (réglages de presque tous les modèles ; sinon voir la notice : 192.168.1.10, port 23…).</li>
    <li>Clique sur <b>Se connecter</b>.</li></ol>`,
  ble: `<h2>Adaptateur Bluetooth basse consommation (BLE)</h2><ol>
    <li>Branche l'adaptateur et <b>mets le contact</b>.</li>
    <li>Active le Bluetooth du PC. <b>Ne l'appaire pas</b> dans les paramètres Windows.</li>
    <li>Clique sur <b>Se connecter</b> puis choisis l'adaptateur dans la liste.</li>
    <li>Si ton adaptateur n'apparaît pas ici, c'est un modèle Bluetooth classique : choisis « Bluetooth ».</li></ol>`,
  demo: `<h2>Mode démo</h2><p>Tu peux tout essayer : lecture et effacement des défauts, calculateurs, données en direct, rapport PDF. Aucune voiture n'est contactée.</p>`,
};
const ctype = () => $("input[name=ctype]:checked").value;
const vtype = () => $("input[name=vtype]:checked").value;
function showType() {
  const t = ctype(), truck = vtype() === "truck", tesla = vtype() === "tesla";
  $("#truckWarn").classList.toggle("hidden", !truck);
  $("#demoText").textContent = tesla ? "Simule une Tesla Model Y (bus véhicule) : batterie, cellules, énergie, moteurs." : truck ? "Simule un camion MAN TGX 2019 (J1939) avec quelques défauts AdBlue / FAP, pour découvrir le logiciel." : "Simule un VW Crafter 2019 2.0 TDI avec quelques défauts, pour découvrir le logiciel.";
  store.set("vtype", vtype());
  ["serial", "wifi", "ble", "demo"].forEach((k) => $("#opt-" + k).classList.toggle("hidden", k !== t));
  $("#helpBox").innerHTML = HELP[t] + (truck ? `<h2 class="mt">Poids lourd MAN</h2><ol>
    <li>La prise diagnostic se trouve dans la cabine (côté passager, près de la boîte à fusibles / ZE).</li>
    <li>Adaptateur <b>12/24 V</b> et <b>J1939</b> obligatoire.</li>
    <li>Le logiciel cherche le bus à 250 puis 500 kbit/s : contact mis, attends quelques secondes.</li>
    <li>Le MAN TGE (utilitaire) se diagnostique en « Voiture / utilitaire », c'est un Crafter.</li></ol>` : "") + (tesla ? `<h2 class="mt">Tesla Model 3 / Model Y</h2><ol>
    <li>Les Tesla n'ont pas de prise OBD standard : il faut un <b>câble adaptateur diagnostic Tesla → OBD</b> adapté à ton modèle et à son année (vendu environ 20 à 40 €).</li>
    <li>Le connecteur de diagnostic se trouve dans l'habitacle (selon les versions : sous la console centrale arrière ou derrière un cache) ; suis la notice du câble.</li>
    <li>Branche l'ELM327 sur le câble, <b>réveille la voiture</b> (ouvre une porte ou allume l'écran) puis connecte-toi.</li>
    <li>Lecture seule : on écoute le bus, rien n'est modifié dans la voiture.</li></ol>` : "") + `<p class="muted mt">Compatible avec les adaptateurs ELM327 v1.4b / v1.5 / v2.x et équivalents (Vgate, Veepeak, OBDLink, Konnwei…). Toutes marques en OBD générique ; diagnostic constructeur pour le groupe VW.</p>`;
  store.set("ctype", t);
}
$$("input[name=ctype], input[name=vtype]").forEach((r) => (r.onchange = showType));
const savedV = $(`input[name=vtype][value=${store.get("vtype", "car")}]`); if (savedV) savedV.checked = true;
const savedType = store.get("ctype", "serial");
const radio = $(`input[name=ctype][value=${savedType}]`); if (radio) radio.checked = true;
$("#wifiHost").value = store.get("wifiHost", "192.168.0.10");
$("#wifiPort").value = store.get("wifiPort", "35000");
$("#baudSel").value = store.get("baud", "38400");
showType();

async function refreshPorts() {
  const sel = $("#portSel");
  try {
    const ports = await diag.listPorts();
    ports.sort((a, b) => (b.obd - a.obd) || (b.usb - a.usb) || (b.bluetooth - a.bluetooth));
    sel.innerHTML = ports.length ? ports.map((p) => `<option value="${esc(p.path)}">${esc(p.label)}${p.bluetooth ? " · Bluetooth" : p.usb ? " · USB" : ""}</option>`).join("") : `<option value="">Aucun port COM trouvé – appaire l'adaptateur</option>`;
    const last = store.get("port", null);
    if (last && ports.find((p) => p.path === last)) sel.value = last;
  } catch (e) { sel.innerHTML = `<option value="">${esc(cleanErr(e))}</option>`; }
}
$("#refreshPorts").onclick = refreshPorts;
refreshPorts();

// ---- Bluetooth BLE (Web Bluetooth) ----
const BLE_SERVICES = ["0000fff0-0000-1000-8000-00805f9b34fb", "0000ffe0-0000-1000-8000-00805f9b34fb", "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffb0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "0000beef-0000-1000-8000-00805f9b34fb"];
let ble = null;
diag.on("ble-devices", (list) => {
  const body = list.length
    ? `<p>Choisis ton adaptateur :</p><div class="blelist">${list.map((d) => `<button class="btn ghost" data-id="${esc(d.id)}">${esc(d.name)}</button>`).join("")}</div><p class="muted">La liste se met à jour toute seule.</p>`
    : `<p class="muted"><span class="spin" style="border-top-color:var(--orange)"></span>Recherche des appareils Bluetooth…</p>`;
  $("#modalTitle").textContent = "Adaptateurs Bluetooth à proximité";
  $("#modalBody").innerHTML = body;
  $("#modalBtns").innerHTML = `<button class="btn ghost" id="bleCancel">Annuler</button>`;
  $("#modal").classList.remove("hidden");
  $$("#modalBody [data-id]").forEach((b) => (b.onclick = () => { $("#modal").classList.add("hidden"); diag.bleChoose(b.dataset.id); }));
  $("#bleCancel").onclick = () => { $("#modal").classList.add("hidden"); diag.bleChoose(""); };
});
diag.on("ble-write", async (s) => {
  if (!ble) return;
  const data = new TextEncoder().encode(s);
  for (let i = 0; i < data.length; i += 20) {
    const part = data.slice(i, i + 20);
    try {
      if (ble.wr.properties.writeWithoutResponse) await ble.wr.writeValueWithoutResponse(part);
      else await ble.wr.writeValue(part);
    } catch (e) { console.warn(e); }
  }
});
async function connectBle() {
  if (!navigator.bluetooth) throw new Error("Bluetooth non disponible sur ce PC.");
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
  const server = await dev.gatt.connect();
  let rd = null, wr = null;
  for (const svc of await server.getPrimaryServices()) {
    let chars = [];
    try { chars = await svc.getCharacteristics(); } catch { continue; }
    const n = chars.find((c) => c.properties.notify || c.properties.indicate);
    const w = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (n && w) { rd = n; wr = w; break; }
  }
  if (!rd) throw new Error("Cet appareil Bluetooth n'est pas un adaptateur OBD reconnu.");
  await rd.startNotifications();
  rd.addEventListener("characteristicvaluechanged", (e) => diag.bleData(Array.from(new Uint8Array(e.target.value.buffer))));
  dev.addEventListener("gattserverdisconnected", () => { ble = null; diag.bleClosed(); });
  ble = { dev, rd, wr };
}

$("#connectBtn").onclick = () => busy($("#connectBtn"), async () => {
  $("#connErr").classList.add("hidden");
  const t = ctype();
  const opts = { type: t, vehicle: vtype() };
  if (t === "serial") {
    opts.path = $("#portSel").value; opts.baud = $("#baudSel").value;
    if (!opts.path) throw new Error("Choisis un port COM (appaire d'abord l'adaptateur dans Windows).");
    store.set("port", opts.path); store.set("baud", opts.baud);
  }
  if (t === "wifi") { opts.host = $("#wifiHost").value.trim(); opts.port = $("#wifiPort").value.trim(); store.set("wifiHost", opts.host); store.set("wifiPort", opts.port); }
  try {
    if (t === "ble") await connectBle();
    await diag.connect(opts);
  } catch (e) {
    $("#connErr").textContent = cleanErr(e); $("#connErr").classList.remove("hidden");
    if (ble) { try { ble.dev.gatt.disconnect(); } catch {} ble = null; }
    throw e;
  }
}).catch(() => {});
$("#disconnectBtn").onclick = async () => { stopLive(); await diag.disconnect(); if (ble) { try { ble.dev.gatt.disconnect(); } catch {} ble = null; } };

diag.on("status", (s) => {
  const pill = $("#statusPill");
  pill.className = "pill " + s.state;
  $("#statusText").textContent = s.state === "connected" ? "Connecté" : s.state === "connecting" ? s.text : "Déconnecté";
  const was = S.connected;
  S.connected = s.state === "connected";
  $("#connectBtn").classList.toggle("hidden", S.connected);
  $("#disconnectBtn").classList.toggle("hidden", !S.connected);
  if (s.state === "connected" && s.info) onConnected(s.info);
  if (s.state === "disconnected" && was) { stopLive(); try { stopMeas(); stopSniff(); } catch {} toast(s.text || "Déconnecté"); $("#voltBox").textContent = ""; }
  logLine("info", `— ${s.text}`);
});

function newSession() {
  S.session = { id: Date.now().toString(36), date: new Date().toISOString() };
  S.obd = S.readiness = S.freeze = null; S.vag = {}; S.selected = null; S.pids = []; S.hist = {};
}

function onConnected(info) {
  if (!S.info || S.info.vin !== info.vin || !!S.info.truck !== !!info.truck) newSession();
  S.info = info;
  document.body.classList.toggle("truck", !!info.truck);
  document.body.classList.toggle("tesla", !!info.tesla);
  selPids = new Set(store.get(info.truck ? "pidsTruck" : "pids", presets().moteur));
  $("#navVag").textContent = info.truck ? "Calculateurs camion" : info.vag ? "Calculateurs VW / Audi" : "Calculateurs";
  $("#vagTitle").textContent = info.truck ? "Calculateurs poids lourd (MAN et autres camions J1939)" : info.vag ? "Calculateurs VW · Audi · Seat · Škoda · Cupra · MAN TGE" : `Calculateurs ${info.brand || ""}`;
  $("#page-defauts h1").textContent = info.truck ? "Défauts poids lourd (J1939 – tous calculateurs)" : "Défauts moteur / antipollution (OBD)";
  $("#navDtc").textContent = info.truck ? "Défauts (J1939)" : "Défauts moteur (OBD)";
  $("#dtcNote").textContent = info.truck ? "Défauts envoyés par tous les calculateurs du camion (norme J1939 : SPN = élément concerné, FMI = type de panne). Le détail par calculateur est dans « Calculateurs camion »." : "Codes génériques lus sur toutes les marques (norme OBD-II). Pour les autres calculateurs (ABS, airbag, tableau de bord…), va dans « Calculateurs ».";
  if (typeof A !== "undefined") A.mod = null;
  initModules();
  const title = [info.brand || "Véhicule", info.model, info.year].filter(Boolean).join(" ");
  $("#vehSummary").innerHTML = `${esc(title)}<small>${esc(info.vin || "VIN non communiqué")}${info.demo ? " · DÉMO" : ""}</small>`;
  setVolt(info.voltage);
  $("#vehCard").classList.remove("hidden");
  $("#vehKv").innerHTML = [
    ["Marque", info.brand || "Inconnue"], ["Année modèle", info.year || "—"], ["N° de série (VIN)", info.vin || "Non communiqué"],
    ["Tension batterie", info.voltage ? fmt(info.voltage, 1) + " V" : "—"], ["Protocole", info.protocolName], ["Adaptateur", info.adapter || "ELM327"],
    ...(info.tesla ? [["Type", "Tesla – lecture du bus véhicule"], ["Diagnostic", "Batterie, cellules, énergie, moteurs (page Tesla)"]] : info.truck ? [["Type", "Poids lourd / bus (24 V)"]] : [["Calculateurs OBD", Object.values(info.ecus || {}).join(", ") || "Moteur"],
    ["Diagnostic tous calculateurs", info.vagCapable ? (info.vag ? "Disponible (groupe VW)" : "Possible (recherche étendue)") : "Non (véhicule non CAN, avant ~2008)"]]),
  ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  $("#vagNote").classList.toggle("bad", !info.vagCapable);
  renderVagTable();
  if (info.truck) $("#vagNote").textContent = "Identification et défauts de chaque calculateur du camion (moteur EDC, boîte TipMatic, EBS, Intarder, ECAS, AdBlue/SCR…) par UDS sur CAN 29 bits. Lance « Recherche étendue » pour trouver tous les calculateurs présents.";
  else if (!info.vag) $("#vagNote").textContent = `${info.brand || "Ce véhicule"} : le moteur et la boîte sont listés ci-dessous. Lance « Recherche étendue » pour trouver tous les autres calculateurs (ABS, airbag, BCM…). Les noms exacts dépendent du constructeur.`;
  $("#fullScanBtn").textContent = info.tesla ? "▶ Voir la batterie et le véhicule" : "▶ Diagnostic complet";
  go("connexion");
  toast("Connecté à " + title);
}
function setVolt(v) {
  const b = $("#voltBox");
  if (!v) { b.textContent = ""; return; }
  b.textContent = "🔋 " + fmt(v, 1) + " V";
  b.classList.toggle("low", S.info?.truck ? v < 23.6 : v < 11.8);
}
setInterval(async () => { if (S.connected && !S.live && !S.working) { try { setVolt(await diag.voltage()); } catch {} } }, 20000);

// ---------- diagnostic complet ----------
$("#fullScanBtn").onclick = () => S.info?.tesla ? go("tesla") : busy($("#fullScanBtn"), async () => {
  S.working = true;
  const prog = $("#fullProg"); prog.classList.remove("hidden");
  const step = (p, t) => { prog.firstElementChild.style.width = Math.round(p * 100) + "%"; prog.lastElementChild.textContent = t; };
  try {
    step(0.03, "Défauts moteur (OBD)…");
    S.obd = await diag.readDtcs(); renderDtcs();
    if (!S.info.truck) {
      step(0.08, "Résultats des autotests…");
      try { S.mode06 = await diag.mode06(); } catch {}
      step(0.12, "Tests antipollution…");
      try { S.readiness = await diag.readiness(); renderCt(); } catch {}
      step(0.18, "Arrêt sur image…");
      try { S.freeze = await diag.freezeFrame(); renderFreeze(); } catch {}
    }
    if (S.info.vagCapable) {
      const mods = S.modules;
      for (let i = 0; i < mods.length; i++) {
        step(0.2 + (0.8 * i) / mods.length, `Calculateur ${mods[i].addr} – ${mods[i].name}…`);
        await scanModule(mods[i]);
      }
    }
    step(1, "Terminé");
    await saveHistory();
    const nObd = S.obd.stored.length + S.obd.pending.length + S.obd.permanent.length + (S.obd.previous || []).length;
    const modsWith = Object.values(S.vag).filter((m) => m.reachable && m.dtcs && m.dtcs.length);
    const nVag = modsWith.reduce((a, m) => a + m.dtcs.length, 0);
    await modal("Diagnostic terminé", `<ul>
      <li><b>${nObd}</b> défaut(s) ${S.info.truck ? "J1939" : "moteur OBD"}</li>
      ${S.info.vagCapable ? `<li><b>${Object.values(S.vag).filter((m) => m.reachable).length}</b> calculateur(s) trouvé(s), <b>${nVag}</b> défaut(s) dans ${modsWith.length} calculateur(s)</li>` : ""}
      ${S.readiness ? `<li>Voyant moteur : <b>${S.readiness.mil ? "ALLUMÉ" : "éteint"}</b></li>` : ""}</ul>`,
      [{ label: "Voir les calculateurs", value: "vag" }, { label: "Créer le rapport PDF", value: "pdf", cls: "primary" }]).then((v) => {
      if (v === "vag") go(S.info.vagCapable ? "vag" : "defauts");
      if (v === "pdf") { go("rapports"); $("#pdfBtn").click(); }
    });
  } finally { S.working = false; setTimeout(() => prog.classList.add("hidden"), 1500); }
}).catch(() => {});

// ---------- défauts OBD ----------
function dtcHtml(d, kind) {
  const cls = kind === "pending" || kind === "previous" ? "warn" : kind === "permanent" ? "info" : "";
  return `<div class="dtc ${cls}"><div class="code">${esc(d.code)}</div><div class="desc"><b>${esc(d.description || d.category)}</b><small>${d.description ? esc(d.category) : "Code constructeur ou peu courant – voir la recherche internet"}${d.ecu ? " · " + (S.info?.truck ? "" : "calculateur ") + esc(d.ecu) : ""}${d.count ? " · " + d.count + " occurrence(s)" : ""}</small></div>
    <button class="btn link" data-url="${esc(searchUrl(d.spn !== undefined ? `SPN ${d.spn} FMI ${d.fmi}` : d.code, d.description))}">Rechercher ↗</button></div>`;
}
function renderDtcs() {
  const o = S.obd, out = $("#dtcOut");
  if (!o) return;
  const groups = [
    ["stored", "Défauts mémorisés (confirmés)", "bad", "Ils allument en général le voyant moteur."],
    ["pending", "Défauts en attente", "warn", "Détectés une fois, pas encore confirmés. À surveiller."],
    ["permanent", "Défauts permanents", "info", "Ne s'effacent pas avec l'outil : la voiture les supprime d'elle-même après réparation et quelques trajets."],
    ["previous", "Défauts passés (inactifs)", "warn", "Défauts apparus auparavant mais qui ne sont plus présents."],
  ];
  if (S.info?.truck) { groups[0][1] = "Défauts actifs"; groups[0][3] = "Présents en ce moment, envoyés par les calculateurs du camion."; }
  o.previous = o.previous || [];
  const total = o.stored.length + o.pending.length + o.permanent.length + o.previous.length;
  const L = o.lamps;
  const lamps = L ? `<div class="lamps"><span class="badge ${L.red ? "bad" : "ok"}">Témoin STOP rouge : ${L.red ? "allumé" : "éteint"}</span><span class="badge ${L.amber ? "warn" : "ok"}">Témoin orange : ${L.amber ? "allumé" : "éteint"}</span><span class="badge ${L.mil ? "bad" : "ok"}">Voyant moteur/antipollution : ${L.mil ? "allumé" : "éteint"}</span></div>` : "";
  out.innerHTML = lamps + (total === 0 ? `<div class="verdict ok"><span class="big">✓</span><div><b>Aucun défaut</b>${S.info?.truck ? "Aucun calculateur du camion ne signale de défaut." : "Le calculateur moteur n'a aucun code défaut OBD."}</div></div>` : "") +
    groups.filter(([k]) => o[k].length).map(([k, t, c, sub]) => `<div class="group"><h2>${t} <span class="badge ${c}">${o[k].length}</span></h2><p class="muted" style="margin:-4px 0 8px">${sub}</p>${o[k].map((d) => dtcHtml(d, k)).join("")}</div>`).join("");
}
document.addEventListener("click", (e) => { const u = e.target.closest("[data-url]"); if (u) diag.openExternal(u.dataset.url); });
$("#readDtcBtn").onclick = () => needConn() && busy($("#readDtcBtn"), async () => { S.obd = await diag.readDtcs(); renderDtcs(); saveHistory(); }).catch(() => {});
$("#clearDtcBtn").onclick = async () => {
  if (!needConn()) return;
  const ok = await confirmBox("Effacer les défauts ?", S.info?.truck ? `<p>Envoie l'ordre d'effacement J1939 (DM11) à tous les calculateurs du camion. Les défauts encore présents reviendront aussitôt.</p><p><b>Contact mis, moteur arrêté.</b> Pense à enregistrer les codes avant (rapport PDF).</p>` : `<p>Cela va :</p><ul><li>éteindre le voyant moteur (s'il revient, la panne est toujours là) ;</li><li>effacer l'arrêt sur image ;</li><li>remettre à zéro les tests antipollution (il faudra rouler avant un contrôle technique).</li></ul><p><b>Contact mis, moteur arrêté.</b> Pense à noter ou enregistrer les codes avant (rapport PDF).</p>`, "Effacer");
  if (!ok) return;
  busy($("#clearDtcBtn"), async () => { await diag.clearDtcs(); toast("Défauts effacés"); S.obd = await diag.readDtcs(); renderDtcs(); }).catch(() => {});
};

// ---------- calculateurs VW ----------
async function initModules() { S.modules = await diag.vagModules(); renderVagTable(); }
initModules();
function modState(m) {
  const r = S.vag[m.addr];
  if (!r) return `<span class="badge">Non testé</span>`;
  if (r.scanning) return `<span class="badge info">Lecture…</span>`;
  if (!r.reachable) return `<span class="badge">Absent</span>`;
  if (r.error) return `<span class="badge warn">Erreur</span>`;
  return r.dtcs.length ? `<span class="badge bad">${r.dtcs.length} défaut${r.dtcs.length > 1 ? "s" : ""}</span>` : `<span class="badge ok">OK</span>`;
}
function renderVagTable() {
  $("#vagTable tbody").innerHTML = S.modules.map((m) => `<tr data-addr="${esc(m.addr)}" class="${S.selected === m.addr ? "sel" : ""}"><td class="mono">${esc(m.addr)}</td><td>${esc(S.vag[m.addr]?.systemName ? m.name + " · " + S.vag[m.addr].systemName : m.name)}</td><td>${modState(m)}</td></tr>`).join("");
  $$("#vagTable tbody tr").forEach((tr) => (tr.onclick = () => selectModule(tr.dataset.addr)));
}
async function scanModule(m) {
  S.vag[m.addr] = { scanning: true };
  renderVagTable();
  try { S.vag[m.addr] = await diag.vagScanModule(m); }
  catch (e) { S.vag[m.addr] = { ...m, reachable: true, error: cleanErr(e), dtcs: [] }; }
  renderVagTable();
  if (S.selected === m.addr) renderModule();
  return S.vag[m.addr];
}
async function selectModule(addr) {
  S.selected = addr;
  renderVagTable();
  const m = S.modules.find((x) => x.addr === addr);
  if (!S.vag[addr] && S.connected) { renderModule(); await scanModule(m); }
  renderModule();
}
function renderModule() {
  const m = S.modules.find((x) => x.addr === S.selected);
  const r = S.vag[S.selected];
  const box = $("#vagDetail");
  if (!m) return;
  if (!r || r.scanning) { box.innerHTML = `<h2>${esc(m.addr)} – ${esc(m.name)}</h2><p class="muted">${S.connected ? "Lecture en cours…" : "Connecte-toi pour lire ce calculateur."}</p>`; return; }
  if (!r.reachable) { box.innerHTML = `<h2>${esc(m.addr)} – ${esc(m.name)}</h2><p class="muted">Ce calculateur ne répond pas : il n'existe pas sur ce véhicule, ou il n'est pas accessible avec un adaptateur ELM327.</p><button class="btn ghost" id="modRescan">Réessayer</button>`; $("#modRescan").onclick = () => busy($("#modRescan"), () => scanModule(m)); return; }
  const kv = [["Système", r.systemName], ["Référence pièce", r.partNumber], ["Version logicielle", r.software], ["Référence matériel", r.hardware], ["Version matériel", r.hwVersion], ["Adresse CAN", `${r.reqHex} → ${r.respHex}`]].filter(([, v]) => v);
  box.innerHTML = `<div class="row between"><h2>${esc(m.addr)} – ${esc(m.name)}</h2><div class="row"><button class="btn ghost" id="modRescan">Relire</button><button class="btn danger" id="modClear">Effacer les défauts</button><button class="btn primary" id="modAtelier">Atelier ›</button></div></div>
    <div class="kv">${kv.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
    ${r.error ? `<p class="err">${esc(r.error)}</p>` : ""}
    <div class="group"><h2>Défauts <span class="badge ${r.dtcs.length ? "bad" : "ok"}">${r.dtcs.length}</span></h2>
    ${r.dtcs.length ? r.dtcs.map((d) => `<div class="dtc ${d.status.active ? "" : "warn"}"><div class="code">${esc(d.code)}</div><div class="desc"><b>${esc(d.description || d.category)}${d.ftbText ? " – " + esc(d.ftbText) : ""}</b><small>${esc(d.status.label)}${d.status.warning ? " · voyant allumé" : ""}${d.description ? "" : " · code constructeur, voir la recherche internet"}</small></div><button class="btn link" data-url="${esc(searchUrl(d.spn !== undefined ? `SPN ${d.spn} FMI ${d.fmi}` : d.base, d.description))}">Rechercher ↗</button></div>`).join("") : `<p class="muted">Aucun défaut dans ce calculateur.</p>`}</div>`;
  $("#modRescan").onclick = () => busy($("#modRescan"), () => scanModule(m)).catch(() => {});
  $("#modAtelier").onclick = () => window.openAtelier(m.addr);
  $("#modClear").onclick = async () => {
    if (!await confirmBox(`Effacer les défauts du calculateur ${m.addr} ?`, `<p>${esc(m.name)}</p><p>Contact mis, moteur arrêté. Les défauts présents (actifs) reviendront tout de suite si la panne est toujours là.</p>`, "Effacer")) return;
    busy($("#modClear"), async () => { await diag.vagClear(m); toast("Défauts effacés"); await scanModule(m); saveHistory(); }).catch(() => {});
  };
}
$("#vagScanAll").onclick = () => needConn() && busy($("#vagScanAll"), async () => {
  S.working = true;
  const prog = $("#vagProg"); prog.classList.remove("hidden");
  try {
    for (let i = 0; i < S.modules.length; i++) {
      const m = S.modules[i];
      prog.firstElementChild.style.width = Math.round((i / S.modules.length) * 100) + "%";
      prog.lastElementChild.textContent = `${m.addr} – ${m.name}`;
      await scanModule(m);
    }
    const first = S.modules.find((m) => S.vag[m.addr]?.dtcs?.length) || S.modules.find((m) => S.vag[m.addr]?.reachable);
    if (first) selectModule(first.addr);
    saveHistory();
  } finally { S.working = false; prog.classList.add("hidden"); }
}).catch(() => {});
diag.on("progress", ({ p, addr }) => {
  const prog = $("#vagProg");
  prog.firstElementChild.style.width = Math.round(p * 100) + "%";
  prog.lastElementChild.textContent = addr ? `Recherche… adresse ${addr}` : "Terminé";
});
$("#vagDiscover").onclick = async () => {
  if (!needConn()) return;
  if (!await confirmBox("Recherche étendue", "<p>Le logiciel va interroger toutes les adresses possibles (environ 1 à 2 minutes en Bluetooth) pour trouver tous les calculateurs présents, y compris ceux qui ne sont pas dans la liste.</p>", "Lancer", "primary")) return;
  busy($("#vagDiscover"), async () => {
    S.working = true;
    $("#vagProg").classList.remove("hidden");
    try {
      const found = await diag.vagDiscover();
      for (const f of found) {
        const known = S.modules.find((m) => m.req === f.req);
        if (!known) S.modules.push(f);
      }
      // ceux qui n'ont pas répondu sont marqués absents
      for (const m of S.modules) if (!found.find((f) => f.req === m.req) && !S.vag[m.addr]) S.vag[m.addr] = { ...m, reachable: false };
      S.modules.sort((a, b) => (S.vag[a.addr]?.reachable === false) - (S.vag[b.addr]?.reachable === false));
      renderVagTable();
      toast(`${found.length} calculateur(s) trouvé(s)`);
    } finally { S.working = false; $("#vagProg").classList.add("hidden"); }
  }).catch(() => {});
};

// ---------- données en direct ----------
const PRESETS = { moteur: [0x0c, 0x0d, 0x05, 0x04, 0x11, 0x0f, 0x10, 0x42], diesel: [0x0c, 0x0b, 0x23, 0x10, 0x2c, 0x62, 0x49, 0x0d], temp: [0x05, 0x0f, 0x5c, 0x46, 0x3c], none: [] };
const PRESETS_TRUCK = { moteur: [1001, 1003, 1004, 1006, 1007, 1009, 1010, 1015], diesel: [1001, 1007, 1011, 1012, 1019, 1017, 1018], temp: [1004, 1005, 1008, 1013], none: [] };
const presets = () => (S.info?.truck ? PRESETS_TRUCK : PRESETS);
const pidKey = () => (S.info?.truck ? "pidsTruck" : "pids");
let selPids = new Set(store.get("pids", PRESETS.moteur));
async function loadPids() {
  try { S.pids = await diag.supportedPids(); } catch (e) { toast(cleanErr(e), true); return; }
  renderPidList();
}
function renderPidList() {
  $("#pidList").innerHTML = S.pids.map((p) => `<label><input type="checkbox" value="${p.pid}" ${selPids.has(p.pid) ? "checked" : ""}> ${esc(p.name)} <span class="muted">${esc(p.unit)}</span></label>`).join("") || `<div class="empty">Aucun paramètre disponible.</div>`;
  $$("#pidList input").forEach((c) => (c.onchange = () => { c.checked ? selPids.add(+c.value) : selPids.delete(+c.value); store.set(pidKey(), [...selPids]); renderTiles(); }));
  renderTiles();
}
$$("[data-preset]").forEach((b) => (b.onclick = () => { selPids = new Set(presets()[b.dataset.preset]); store.set(pidKey(), [...selPids]); renderPidList(); }));
const activePids = () => S.pids.filter((p) => selPids.has(p.pid));
function renderTiles() {
  $("#tiles").innerHTML = activePids().map((p) => `<div class="tile" id="tile-${p.pid}"><div class="n">${esc(p.name)}</div><div class="v"><span>—</span><small>${esc(p.unit)}</small></div><canvas width="400" height="80"></canvas><div class="mm"><span class="mn"></span><span class="mx"></span></div></div>`).join("") || (S.pids.length ? `<div class="empty">Coche des paramètres à gauche.</div>` : "");
  for (const p of activePids()) drawTile(p);
}
function drawTile(p) {
  const el = $("#tile-" + p.pid); if (!el) return;
  const h = S.hist[p.pid] || [];
  const last = h[h.length - 1];
  el.querySelector(".v span").textContent = last === undefined ? "—" : fmt(last, p.dec);
  if (!h.length) return;
  const mn = Math.min(...h), mx = Math.max(...h);
  el.querySelector(".mn").textContent = "min " + fmt(mn, p.dec);
  el.querySelector(".mx").textContent = "max " + fmt(mx, p.dec);
  const c = el.querySelector("canvas"), g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  const lo = Math.min(mn, p.min ?? mn), hi = Math.max(mx, p.max ?? mx, lo + 1e-6);
  g.beginPath();
  h.forEach((v, i) => { const x = (i / 119) * c.width, y = c.height - 4 - ((v - lo) / (hi - lo)) * (c.height - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = "#e8771e"; g.lineWidth = 3; g.stroke();
}
function stopLive() { S.live = false; $("#liveStart").textContent = "▶ Démarrer"; $("#liveStart").classList.add("primary"); }
$("#liveStart").onclick = async () => {
  if (S.live) return stopLive();
  if (!needConn()) return;
  if (!S.pids.length) await loadPids();
  if (!activePids().length) return toast("Coche au moins un paramètre.", true);
  S.live = true; S.rec = [];
  $("#liveStart").textContent = "■ Arrêter"; $("#liveStart").classList.remove("primary");
  while (S.live) {
    const pids = activePids().map((p) => p.pid);
    const t0 = performance.now();
    let vals;
    try { vals = await diag.readPids(pids); } catch (e) { toast(cleanErr(e), true); stopLive(); break; }
    const row = { t: new Date() };
    for (const pid of pids) {
      if (vals[pid] === undefined) continue;
      (S.hist[pid] = S.hist[pid] || []).push(vals[pid]);
      if (S.hist[pid].length > 120) S.hist[pid].shift();
      row[pid] = vals[pid];
    }
    S.rec.push(row);
    for (const p of activePids()) drawTile(p);
    if (vals[0x42] || vals[1009]) setVolt(vals[0x42] || vals[1009]);
    $("#liveRate").textContent = `${(1000 / (performance.now() - t0)).toFixed(1)} mesures/s`;
    await new Promise((r) => setTimeout(r, 50));
  }
};
$("#liveCsv").onclick = async () => {
  if (!S.rec.length) return toast("Lance d'abord une mesure.", true);
  const pids = [...new Set(S.rec.flatMap((r) => Object.keys(r).filter((k) => k !== "t")))].map(Number);
  const head = ["Heure", ...pids.map((p) => { const d = S.pids.find((x) => x.pid === p); return `${d.name} (${d.unit})`; })];
  const lines = [head.join(";"), ...S.rec.map((r) => [r.t.toLocaleTimeString("fr-FR") + "," + String(r.t.getMilliseconds()).padStart(3, "0"), ...pids.map((p) => (r[p] === undefined ? "" : String(+r[p].toFixed(3)).replace(".", ",")))].join(";"))];
  const f = await diag.saveCsv({ text: lines.join("\r\n"), name: `Mesures ${S.info?.vin || ""} ${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}.csv` });
  if (f) toast("Enregistré : " + f);
};

// ---------- préparation CT ----------
function renderCt() {
  const r = S.readiness; if (!r) return;
  const incomplete = r.monitors.filter((m) => !m.complete);
  const v = r.mil ? ["bad", "✗", "Voyant moteur allumé", "Le véhicule sera refusé au contrôle technique tant que le défaut n'est pas réparé."]
    : incomplete.length > 1 ? ["warn", "⏳", "Pas encore prêt", `${incomplete.length} tests antipollution ne sont pas terminés : roule encore (ville + route + autoroute) puis revérifie.`]
    : incomplete.length === 1 ? ["warn", "⏳", "Presque prêt", "Un seul test n'est pas terminé. En général toléré, mais mieux vaut rouler encore un peu."]
    : ["ok", "✓", "Prêt pour le contrôle technique", "Voyant éteint et tous les tests antipollution sont terminés."];
  $("#ctOut").innerHTML = `<div class="verdict ${v[0]}"><span class="big">${v[1]}</span><div><b>${v[2]}</b>${v[3]}</div></div>
   <div class="grid2"><div class="card flush">${r.monitors.map((m) => `<div class="mon"><span class="ic" style="background:${m.complete ? "var(--ok)" : "var(--warn)"}">${m.complete ? "✓" : "…"}</span><span class="grow">${esc(m.name)}</span><span class="badge ${m.complete ? "ok" : "warn"}">${m.complete ? "Terminé" : "Non terminé"}</span></div>`).join("")}</div>
   <div class="card"><div class="kv">${[["Voyant moteur", r.mil ? "ALLUMÉ" : "Éteint"], ["Défauts confirmés", r.dtcCount], ["Moteur", r.diesel ? "Diesel" : "Essence"], ["Distance avec voyant allumé", r.distanceMil !== undefined ? fmt(r.distanceMil, 0) + " km" : "—"], ["Distance depuis effacement", r.distanceSinceClear !== undefined ? fmt(r.distanceSinceClear, 0) + " km" : "—"], ["Démarrages depuis effacement", r.warmups ?? "—"], ["Temps depuis effacement", r.minutesSinceClear !== undefined ? fmt(r.minutesSinceClear / 60, 1) + " h" : "—"]].map(([k, x]) => `<div><span>${k}</span><b>${esc(x)}</b></div>`).join("")}</div></div></div>`;
}
$("#ctBtn").onclick = () => needConn() && busy($("#ctBtn"), async () => { S.readiness = await diag.readiness(); renderCt(); }).catch(() => {});

// ---------- arrêt sur image ----------
function renderFreeze() {
  const f = S.freeze; if (!f) return;
  $("#ffOut").innerHTML = !f.dtc ? `<div class="empty">Aucun arrêt sur image enregistré (pas de défaut moteur confirmé).</div>`
    : `${dtcHtml(f.dtc, "stored")}<div class="card flush"><table class="tbl"><thead><tr><th>Paramètre</th><th>Valeur au moment du défaut</th></tr></thead><tbody>${f.values.map((v) => `<tr><td>${esc(v.name)}</td><td><b>${fmt(v.value, v.dec ?? 1)}</b> ${esc(v.unit)}</td></tr>`).join("")}</tbody></table></div>`;
}
$("#ffBtn").onclick = () => needConn() && busy($("#ffBtn"), async () => { S.freeze = await diag.freezeFrame(); renderFreeze(); }).catch(() => {});

// ---------- rapports & historique ----------
function currentEntry() {
  const i = S.info || {};
  return {
    id: S.session?.id || Date.now().toString(36), date: S.session?.date || new Date().toISOString(),
    vin: i.vin, brand: i.brand, truck: !!i.truck, year: i.year, voltage: i.voltage, protocol: i.protocolName, demo: i.demo,
    client: $("#repClient").value.trim(), km: $("#repKm").value.trim(), notes: $("#repNotes").value.trim(),
    obd: S.obd, readiness: S.readiness, freeze: S.freeze, mode06: S.mode06 || null,
    modules: Object.values(S.vag).filter((m) => m && m.reachable).sort((a, b) => String(a.addr).localeCompare(String(b.addr))).map((m) => ({ addr: m.addr, name: m.name, systemName: m.systemName, partNumber: m.partNumber, software: m.software, dtcs: m.dtcs, error: m.error })),
  };
}
async function saveHistory() { if (S.info) { try { await diag.saveHistory(currentEntry()); } catch {} } }
["#repClient", "#repKm", "#repNotes"].forEach((s) => $(s).addEventListener("change", saveHistory));
async function exportPdf(entry) {
  const html = buildReport(entry);
  const name = `Diagnostic ${entry.brand || ""} ${entry.vin || ""} ${new Date(entry.date).toLocaleDateString("fr-FR").replace(/\//g, "-")}.pdf`.replace(/\s+/g, " ");
  const f = await diag.savePdf({ html, name });
  if (f) toast("Rapport enregistré");
}
$("#pdfBtn").onclick = () => {
  if (!S.info) return toast("Fais d'abord un diagnostic (page Connexion → Diagnostic complet).", true);
  busy($("#pdfBtn"), async () => { await saveHistory(); await exportPdf(currentEntry()); renderHistory(); }).catch(() => {});
};
async function renderHistory() {
  const h = await diag.history();
  const n = (e) => (e.obd ? e.obd.stored.length + e.obd.pending.length + (e.obd.previous || []).length : 0) + (e.modules || []).reduce((a, m) => a + (m.dtcs ? m.dtcs.length : 0), 0);
  $("#histOut").innerHTML = h.length ? h.map((e) => `<div class="hist"><div class="grow"><b>${esc([e.brand, e.year].filter(Boolean).join(" ") || "Véhicule")} ${e.client ? "– " + esc(e.client) : ""}</b><small>${new Date(e.date).toLocaleString("fr-FR")} · ${esc(e.vin || "VIN inconnu")}${e.demo ? " · démo" : ""}</small></div><span class="badge ${n(e) ? "bad" : "ok"}">${n(e)} défaut(s)</span><button class="btn ghost mini" data-pdf="${e.id}">PDF</button><button class="btn link" data-del="${e.id}">Supprimer</button></div>`).join("") : `<div class="empty">Aucun diagnostic enregistré pour l'instant.</div>`;
  $$("[data-pdf]").forEach((b) => (b.onclick = () => exportPdf(h.find((e) => e.id === b.dataset.pdf))));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (await confirmBox("Supprimer ce diagnostic de l'historique ?", "", "Supprimer")) { await diag.deleteHistory(b.dataset.del); renderHistory(); } }));
}

// ---------- terminal ----------
const term = $("#termOut");
function logLine(dir, text) {
  const div = document.createElement("div");
  div.className = dir;
  div.textContent = dir === "tx" ? "> " + text : text;
  term.appendChild(div);
  while (term.childElementCount > 3000) term.firstChild.remove();
  if (!term.closest(".hidden")) term.scrollTop = term.scrollHeight;
}
diag.on("log", (l) => logLine(l.dir, l.text));
async function sendTerm() {
  const c = $("#termIn").value.trim(); if (!c || !needConn()) return;
  $("#termIn").value = "";
  try { await diag.raw(c); } catch (e) { logLine("info", "Erreur : " + cleanErr(e)); }
}
$("#termSend").onclick = sendTerm;
$("#termIn").addEventListener("keydown", (e) => { if (e.key === "Enter") sendTerm(); });
$("#termClear").onclick = () => (term.innerHTML = "");

// ---------- version / mises à jour ----------
diag.appVersion().then((v) => ($("#version").textContent = `G&L Créations · v${v}`));
diag.on("update", (u) => {
  const b = $("#updateBanner");
  b.classList.remove("hidden");
  if (u.state === "ready") { b.textContent = `Mise à jour ${u.version} prête – cliquer pour redémarrer`; b.onclick = () => diag.installUpdate(); }
  else { b.textContent = `Téléchargement de la mise à jour ${u.version}…`; b.onclick = null; }
});
