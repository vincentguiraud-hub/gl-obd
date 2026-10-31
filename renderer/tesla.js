"use strict";
/* global diag, S, $, $$, esc, fmt, toast, busy, cleanErr, modal, confirmBox, needConn, go, A, at */

// ================= TESLA =================
const T = { on: false, sum: null, all: [] };
function tTile(name, value, unit, dec = 1, sub = "") {
  return `<div class="tile"><div class="n">${esc(name)}</div><div class="v"><span>${value === null || value === undefined ? "—" : typeof value === "string" ? esc(value) : fmt(value, dec)}</span><small>${esc(unit)}</small></div>${sub ? `<div class="mm"><span>${sub}</span></div>` : ""}</div>`;
}
function renderTesla() {
  const s = T.sum; if (!s) return;
  $("#teslaTiles").innerHTML = [
    tTile("Charge affichée (SOC)", s.soc, "%", 1, s.socMin !== null ? `min ${fmt(s.socMin, 1)} · max ${fmt(s.socMax, 1)} %` : ""),
    tTile("Santé batterie (estimée)", s.health, "%", 1, s.fullPack ? `${fmt(s.fullPack, 1)} kWh sur ${fmt(s.bol, 1)} kWh d'origine` : ""),
    tTile("Énergie restante", s.remaining, "kWh", 1, s.toFull !== null ? `${fmt(s.toFull, 1)} kWh pour être pleine · réserve ${fmt(s.buffer, 1)}` : ""),
    tTile("Autonomie affichée", s.rangeMi !== null ? s.rangeMi * 1.609 : null, "km", 0),
    tTile("Tension batterie", s.voltage, "V", 1),
    tTile("Courant batterie", s.current, "A", 1),
    tTile("Puissance batterie", s.power, "kW", 1),
    tTile("Écart entre cellules", s.cells ? s.cells.delta : null, "mV", 0, s.cells ? `${s.cells.count} groupes · ${fmt(s.cells.min, 3)} à ${fmt(s.cells.max, 3)} V` : "lecture en cours…"),
    tTile("Température batterie", s.packTempMax, "°C", 1, s.packTempMin !== null ? `min ${fmt(s.packTempMin, 1)} °C` : ""),
    tTile("Total chargé (vie)", s.charged, "kWh", 0),
    tTile("Total consommé (vie)", s.discharged, "kWh", 0),
    tTile("Vitesse", s.speed, "km/h", 0, s.gear ? `rapport ${esc(String(s.gear))}` : ""),
    tTile("Moteur arrière", s.rearPower, "kW", 1),
    tTile("Moteur avant", s.frontPower, "kW", 1),
    tTile("Température extérieure", s.ambient, "°C", 1),
    tTile("Kilométrage", s.odometer, "km", 0),
  ].join("");
}
function stopTesla() { T.on = false; $("#teslaBtn").textContent = "▶ Lire en continu"; $("#teslaBtn").classList.add("primary"); }
$("#teslaBtn").onclick = async () => {
  if (T.on) return stopTesla();
  if (!needConn()) return;
  T.on = true; $("#teslaBtn").textContent = "■ Arrêter"; $("#teslaBtn").classList.remove("primary");
  while (T.on) {
    const t0 = performance.now();
    try { T.sum = await diag.teslaPoll(); } catch (e) { toast(cleanErr(e), true); stopTesla(); break; }
    renderTesla();
    $("#teslaRate").textContent = `actualisé en ${fmt((performance.now() - t0) / 1000, 1)} s`;
  }
};
$("#teslaAllBtn").onclick = () => needConn() && busy($("#teslaAllBtn"), async () => { T.all = await diag.teslaAll(2000); renderTeslaAll(); }).catch(() => {});
$("#teslaFilter").oninput = () => renderTeslaAll();
function renderTeslaAll() {
  const q = $("#teslaFilter").value.trim().toLowerCase();
  const list = T.all.map((m) => ({ ...m, signals: m.signals.filter((x) => !q || `${m.name} ${x.name}`.toLowerCase().includes(q)) })).filter((m) => m.signals.length);
  $("#teslaAll").innerHTML = list.map((m) => `<details class="msg" ${q ? "open" : ""}><summary>${esc(m.id)} · ${esc(m.name.replace(/^ID[0-9A-F]{3}/, ""))} <span class="muted">(${m.signals.length})</span></summary>
    <table class="tbl sigtbl"><tbody>${m.signals.map((x) => `<tr><td>${esc(x.name)}</td><td><b>${x.text ? esc(x.text) : fmt(x.value, Number.isInteger(x.value) ? 0 : 3)}</b> ${esc(x.unit || "")}</td></tr>`).join("")}</tbody></table></details>`).join("")
    || `<div class="empty">Clique sur « Tout lire » pour décoder toutes les trames reçues.</div>`;
}

// ================= OPTIONS CACHÉES =================
// Recettes de démonstration (calculateurs simulés uniquement)
const DEMO_RECIPES = [
  { id: "demo-1", demo: true, brand: "Démo", title: "Option démo : confort BCM", description: "Exemple sur le véhicule simulé (BCM, octet 2, bit 7).", addr: "09", type: "bit", byte: 2, bit: 7, login: "31347" },
  { id: "demo-2", demo: true, brand: "Démo", title: "Option démo : affichage combiné", description: "Exemple sur le véhicule simulé (combiné, octet 3, bit 0).", addr: "17", type: "bit", byte: 3, bit: 0 },
  { id: "demo-3", demo: true, brand: "Démo", title: "Option démo : valeur moteur", description: "Exemple d'adaptation (moteur, valeur 1005 : 3E ↔ 46).", addr: "01", type: "did", did: "1005", onHex: "46", offHex: "3E" },
];
const O = { recipes: [], state: {} };
diag.recipes().then((r) => (O.recipes = r || []));
const recipes = () => [...(S.info?.demo && !S.info?.truck && !S.info?.tesla ? DEMO_RECIPES : []), ...O.recipes];
const findMod = (addr) => S.modules.find((m) => m.addr.toUpperCase() === String(addr).toUpperCase());
const H = (b) => b.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const hb = (h) => (String(h).replace(/[^0-9a-f]/gi, "").match(/../g) || []).map((x) => parseInt(x, 16));

async function readRecipeState(r) {
  const m = findMod(r.addr);
  if (!m) return { err: "calculateur introuvable" };
  try {
    if (r.type === "did") {
      const v = await diag.atelier("did", m, r.did);
      if (!v) return { err: "valeur illisible" };
      return { cur: hb(v.hex), on: v.hex.replace(/ /g, "") === String(r.onHex).replace(/\s/g, "").toUpperCase() };
    }
    const c = await diag.atelier("readCoding", m);
    if (r.byte >= c.length) return { err: "octet hors du codage" };
    const on = r.type === "bit" ? !!(c[r.byte] & (1 << r.bit)) : c[r.byte] === parseInt(r.onHex, 16);
    return { cur: c, on };
  } catch (e) { return { err: cleanErr(e) }; }
}

function renderOptions() {
  const list = recipes();
  $("#optTesla").classList.toggle("hidden", !S.info?.tesla);
  $("#optList").innerHTML = list.length ? list.map((r) => {
    const st = O.state[r.id] || {};
    const where = `Calculateur ${esc(r.addr)} · ${r.type === "did" ? `valeur ${esc(r.did)}` : r.type === "bit" ? `octet ${r.byte}, bit ${r.bit}` : `octet ${r.byte} = ${esc(r.onHex)}`}`;
    return `<div class="opt"><button class="switch ${st.on ? "on" : ""}" data-opt="${esc(r.id)}" ${st.cur ? "" : "disabled"} title="${st.cur ? "Activer / désactiver" : "Lis d'abord l'état"}"></button>
      <div class="grow"><b>${esc(r.title)}</b> <span class="badge">${esc(r.brand || "")}</span><small>${esc(r.description || "")}</small><small>${where}${r.source ? " · source : " + esc(r.source) : ""}${st.err ? ` · <span style="color:var(--bad)">${esc(st.err)}</span>` : st.cur ? (st.on ? " · <b>activée</b>" : " · désactivée") : ""}</small></div>
      <button class="btn ghost mini" data-read="${esc(r.id)}">Lire l'état</button>${r.demo ? "" : `<button class="btn link" data-del="${esc(r.id)}">Supprimer</button>`}</div>`;
  }).join("") + `<div class="row mt"><button class="btn ghost" id="optReadAll">Lire l'état de toutes les options</button></div>`
    : `<div class="empty">Aucune option enregistrée. Clique sur « + Ajouter une option » pour saisir une recette (calculateur, octet, bit) trouvée pour ton véhicule, ou importe un fichier d'options.</div>`;
  $$("[data-read]").forEach((b) => (b.onclick = () => needConn() && busy(b, async () => { const r = list.find((x) => x.id === b.dataset.read); O.state[r.id] = await readRecipeState(r); renderOptions(); }).catch(() => {})));
  $$("[data-opt]").forEach((b) => (b.onclick = () => toggleRecipe(list.find((x) => x.id === b.dataset.opt), b)));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (!await confirmBox("Supprimer cette option de la liste ?", "<p>Le véhicule n'est pas modifié.</p>", "Supprimer")) return; O.recipes = O.recipes.filter((x) => x.id !== b.dataset.del); await diag.saveRecipes(O.recipes); renderOptions(); }));
  const all = $("#optReadAll");
  if (all) all.onclick = () => needConn() && busy(all, async () => { for (const r of list) O.state[r.id] = await readRecipeState(r); renderOptions(); }).catch(() => {});
}

async function toggleRecipe(r, btn) {
  const st = O.state[r.id]; if (!st || !st.cur) return;
  const m = findMod(r.addr);
  const want = !st.on;
  let did, before = st.cur, after;
  if (r.type === "did") { did = r.did; after = hb(want ? r.onHex : r.offHex); }
  else {
    did = "0600"; after = [...st.cur];
    if (r.type === "bit") after[r.byte] = want ? after[r.byte] | (1 << r.bit) : after[r.byte] & ~(1 << r.bit);
    else after[r.byte] = parseInt(want ? r.onHex : r.offHex, 16);
  }
  if (!after.length) return toast("Valeur de désactivation non renseignée pour cette option.", true);
  const ok = await confirmBox(`${want ? "Activer" : "Désactiver"} « ${r.title} » ?`, `<p><b>${esc(m.addr)} – ${esc(m.name)}</b></p><p class="mono small">Avant : ${H(before)}<br>Après : ${H(after)}</p>
    <ul><li>Contact mis, moteur arrêté, chargeur de batterie conseillé.</li><li>Sauvegarde automatique avant écriture (restaurable plus bas).</li><li>Vérifie que la recette correspond bien à la référence de ton calculateur.</li></ul>`, want ? "Activer" : "Désactiver", "primary");
  if (!ok) return;
  busy(btn, async () => {
    await diag.backup({ date: new Date().toISOString(), vin: S.info?.vin, addr: m.addr, module: `${m.addr} ${m.name}`, did, login: r.login || undefined, before: H(before), after: H(after), option: r.title });
    await diag.atelier("writeDid", m, did, after, r.login ? { login: r.login } : {});
    O.state[r.id] = await readRecipeState(r);
    toast(O.state[r.id].on === want ? "Option " + (want ? "activée ✓" : "désactivée ✓") : "Écrit, mais l'état lu ne correspond pas : vérifie la recette.", O.state[r.id].on !== want);
    renderOptions(); renderBackups();
  }).catch(() => {});
}

$("#optAdd").onclick = async () => {
  const mods = S.modules.map((m) => `<option value="${esc(m.addr)}">${esc(m.addr)} – ${esc(m.name)}</option>`).join("");
  const res = await modal("Ajouter une option", `
    <label>Nom de l'option <input id="rcTitle" placeholder="ex. Balayage des aiguilles au démarrage"></label>
    <label>Description <input id="rcDesc" placeholder="facultatif"></label>
    <div class="row"><label class="grow">Marque <input id="rcBrand" value="${esc(S.info?.brand || "")}"></label><label class="grow">Calculateur <select id="rcAddr">${mods}</select></label></div>
    <label>Type de modification <select id="rcType"><option value="bit">Codage long : un bit</option><option value="byte">Codage long : un octet entier</option><option value="did">Adaptation (valeur n° DID)</option></select></label>
    <div class="row"><label class="grow">Octet n° <input id="rcByte" class="mono" value="0"></label><label class="grow">Bit n° (0 à 7) <input id="rcBit" class="mono" value="0"></label><label class="grow">N° de valeur (DID) <input id="rcDid" class="mono" placeholder="ex. 1005"></label></div>
    <div class="row"><label class="grow">Valeur « activée » (hex) <input id="rcOn" class="mono" placeholder="octet / valeur"></label><label class="grow">Valeur « désactivée » (hex) <input id="rcOff" class="mono"></label></div>
    <label>Code d'accès (si nécessaire) <input id="rcLogin" class="mono"></label>
    <label>Source (forum, notice…) <input id="rcSrc"></label>
    <p class="muted small">Pour « un bit », seuls octet et bit comptent. Les positions dépendent de la référence exacte du calculateur : vérifie-la dans l'atelier (onglet Identification).</p>`,
    [{ label: "Annuler", value: null }, { label: "Ajouter", value: "ok", cls: "primary" }]);
  if (!res) return;
  const r = { id: "o" + Date.now().toString(36), title: $("#rcTitle").value.trim() || "Option", description: $("#rcDesc").value.trim(), brand: $("#rcBrand").value.trim(), addr: $("#rcAddr").value,
    type: $("#rcType").value, byte: parseInt($("#rcByte").value, 10) || 0, bit: Math.min(7, Math.max(0, parseInt($("#rcBit").value, 10) || 0)),
    did: $("#rcDid").value.trim().toUpperCase(), onHex: $("#rcOn").value.trim(), offHex: $("#rcOff").value.trim(), login: $("#rcLogin").value.trim(), source: $("#rcSrc").value.trim() };
  if (!r.addr) return toast("Connecte-toi d'abord pour choisir le calculateur.", true);
  if (r.type === "did" && !/^[0-9A-F]{4}$/.test(r.did)) return toast("N° de valeur : 4 caractères hexadécimaux.", true);
  O.recipes.push(r); await diag.saveRecipes(O.recipes); renderOptions();
};
$("#optExport").onclick = async () => { if (!O.recipes.length) return toast("Aucune option à exporter.", true); const f = await diag.saveText({ text: JSON.stringify(O.recipes, null, 1), name: "Options G&L Diag.json", ext: "json" }); if (f) toast("Exporté"); };
$("#optImport").onclick = async () => {
  try {
    const data = await diag.importRecipes(); if (!data) return;
    let n = 0;
    for (const r of data) if (r && r.title && r.addr && ["bit", "byte", "did"].includes(r.type)) { r.id = "o" + Date.now().toString(36) + n; O.recipes.push(r); n++; }
    await diag.saveRecipes(O.recipes); renderOptions(); toast(`${n} option(s) importée(s)`);
  } catch (e) { toast(cleanErr(e), true); }
};

async function renderBackups() {
  const list = await diag.listBackups();
  $("#bkList").innerHTML = list.length ? list.map((b, i) => `<div class="hist"><div class="grow"><b>${esc(b.option || (b.did === "0600" ? "Codage long" : "Valeur " + b.did))} – ${esc(b.module || "")}</b><small>${new Date(b.date).toLocaleString("fr-FR")} · ${esc(b.vin || "")} · avant : <span class="mono">${esc(b.before)}</span></small></div><button class="btn ghost mini" data-restore="${i}">Restaurer</button></div>`).join("")
    : `<div class="empty">Aucune sauvegarde pour l'instant.</div>`;
  $$("[data-restore]").forEach((btn) => (btn.onclick = async () => {
    if (!needConn()) return;
    const b = list[+btn.dataset.restore];
    const addr = b.addr || String(b.module || "").split(" ")[0];
    const m = findMod(addr);
    if (!m) return toast("Calculateur " + addr + " introuvable sur ce véhicule.", true);
    if (S.info?.vin && b.vin && S.info.vin !== b.vin && !await confirmBox("Autre véhicule !", `<p>Cette sauvegarde vient du véhicule ${esc(b.vin)}, tu es connecté à ${esc(S.info.vin)}.</p>`, "Restaurer quand même")) return;
    if (!await confirmBox("Restaurer la valeur d'origine ?", `<p>${esc(b.module)}</p><p class="mono small">${esc(b.before)}</p>`, "Restaurer", "primary")) return;
    busy(btn, async () => { await diag.atelier("writeDid", m, b.did, hb(b.before), b.login ? { login: b.login } : {}); toast("Valeur d'origine restaurée ✓"); }).catch(() => {});
  }));
}
document.querySelector('#nav a[data-page=options]').addEventListener("click", () => { renderOptions(); renderBackups(); });
document.querySelector('#nav a[data-page=tesla]').addEventListener("click", () => renderTeslaAll());
