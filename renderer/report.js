"use strict";
// Rapport de diagnostic imprimable (converti en PDF par le processus principal)
// eslint-disable-next-line no-unused-vars
function buildReport(e) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 0) => (v === undefined || v === null ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const date = new Date(e.date);
  const obd = { stored: [], pending: [], permanent: [], previous: [], ...(e.obd || {}) };
  const mods = e.modules || [];
  const nObd = obd.stored.length + obd.pending.length + obd.permanent.length + obd.previous.length;
  const nVag = mods.reduce((a, m) => a + (m.dtcs ? m.dtcs.length : 0), 0);
  const r = e.readiness;

  const dtcRows = (list, label) => list.map((d) => `<tr><td class="c">${esc(d.code)}</td><td>${esc(d.description || d.category)}${d.ftbText ? " – " + esc(d.ftbText) : ""}</td><td>${esc(label || (d.status && d.status.label) || "")}</td></tr>`).join("");
  const obdBlock = nObd
    ? `<table><thead><tr><th style="width:90px">Code</th><th>Description</th><th style="width:170px">État</th></tr></thead><tbody>${dtcRows(obd.stored, e.truck ? "Actif" : "Mémorisé (confirmé)")}${dtcRows(obd.pending, "En attente")}${dtcRows(obd.permanent, "Permanent")}${dtcRows(obd.previous, "Passé (inactif)")}</tbody></table>`
    : `<p class="ok">✓ Aucun défaut.</p>`;

  const modBlock = mods.length
    ? mods.map((m) => `<div class="mod"><div class="mh"><b>${esc(m.addr)} – ${esc(m.name)}</b><span>${esc([m.systemName, m.partNumber, m.software && "logiciel " + m.software].filter(Boolean).join(" · "))}</span></div>
      ${m.dtcs && m.dtcs.length ? `<table><tbody>${dtcRows(m.dtcs)}</tbody></table>` : `<p class="ok small">✓ Aucun défaut</p>`}</div>`).join("")
    : `<p class="muted">Calculateurs constructeur non lus.</p>`;

  const ff = e.freeze && e.freeze.dtc
    ? `<h2>Arrêt sur image (défaut ${esc(e.freeze.dtc.code)})</h2><table class="two"><tbody>${e.freeze.values.map((v) => `<tr><td>${esc(v.name)}</td><td><b>${fmt(v.value, v.dec ?? 1)}</b> ${esc(v.unit)}</td></tr>`).join("")}</tbody></table>` : "";

  const m6 = (e.mode06 || []).filter((t) => !t.pass);
  const m6b = e.mode06 && e.mode06.length ? `<h2>Autotests antipollution (mode 06)</h2>${m6.length ? `<table><thead><tr><th>Système</th><th>Mesure</th><th>Limites</th></tr></thead><tbody>${m6.map((t) => `<tr><td class="bad">${esc(t.name)}</td><td>${fmt(t.value, 2)} ${esc(t.unit)}</td><td>${fmt(t.min, 2)} – ${fmt(t.max, 2)}</td></tr>`).join("")}</tbody></table>` : `<p class="ok">✓ Les ${e.mode06.length} autotests sont dans les limites.</p>`}` : "";
  const ready = r ? `<h2>Tests antipollution (contrôle technique)</h2>
    <p>Voyant moteur : <b class="${r.mil ? "bad" : "okc"}">${r.mil ? "ALLUMÉ" : "éteint"}</b> · Distance depuis effacement : ${fmt(r.distanceSinceClear)} km</p>
    <table class="two"><tbody>${r.monitors.map((m) => `<tr><td>${esc(m.name)}</td><td class="${m.complete ? "okc" : "warnc"}">${m.complete ? "✓ Terminé" : "… Non terminé"}</td></tr>`).join("")}</tbody></table>` : "";

  const logo = `<svg viewBox="0 0 256 256" width="54" height="54"><rect x="8" y="8" width="240" height="240" rx="44" fill="#1f2733"/><path d="M52 150 A76 76 0 0 1 204 150" fill="none" stroke="#e8771e" stroke-width="18" stroke-linecap="round"/><line x1="128" y1="150" x2="166" y2="112" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="128" cy="150" r="13" fill="#e8771e"/><text x="128" y="222" text-anchor="middle" font-family="Arial" font-weight="700" font-size="44" fill="#fff">G&amp;L</text></svg>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de diagnostic</title><style>
  body{font:11pt/1.4 "Segoe UI",Arial,sans-serif;color:#1d2430;margin:0}
  .hd{display:flex;gap:14px;align-items:center;border-bottom:3px solid #e8771e;padding-bottom:10px}
  .hd .t{flex:1}.hd h1{margin:0;font-size:20pt}.hd .co{text-align:right;font-size:9pt;color:#555}
  h2{font-size:12.5pt;margin:20px 0 8px;color:#1f2733;border-left:4px solid #e8771e;padding-left:8px}
  .veh{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;background:#f5f6f8;padding:10px 12px;border-radius:8px;margin-top:12px}
  .veh span{display:block;font-size:8.5pt;color:#6b7380}.veh b{font-size:10.5pt;word-break:break-all}
  .sum{display:flex;gap:10px;margin-top:12px}.sum div{flex:1;border:1px solid #e2e5ea;border-radius:8px;padding:8px 12px}.sum b{font-size:18pt;display:block}
  table{width:100%;border-collapse:collapse;font-size:10pt}th{text-align:left;background:#f5f6f8;font-size:9pt;color:#555}
  td,th{padding:5px 8px;border-bottom:1px solid #e8eaee;vertical-align:top}td.c{font-family:Consolas,monospace;font-weight:700;white-space:nowrap;width:120px}
  table.two td:first-child{width:60%}
  .mod{border:1px solid #e2e5ea;border-radius:8px;margin-bottom:8px;page-break-inside:avoid;overflow:hidden}
  .mh{background:#f5f6f8;padding:6px 10px;display:flex;justify-content:space-between;gap:10px}.mh span{color:#6b7380;font-size:9pt}
  .mod p{margin:6px 10px}.ok,.okc{color:#1f9d55}.bad{color:#d64545}.warnc{color:#d98a00}.muted{color:#6b7380}.small{font-size:9.5pt}
  .notes{white-space:pre-wrap;background:#fff8f1;border:1px solid #f3d3b4;border-radius:8px;padding:10px}
  .ft{margin-top:24px;font-size:8.5pt;color:#888;border-top:1px solid #ddd;padding-top:6px}
  </style></head><body>
  <div class="hd">${logo}<div class="t"><h1>Rapport de diagnostic</h1><div>${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div></div>
  <div class="co"><b>G&amp;L Créations</b><br>30140 Massillargues-Attuech<br>06.20.81.38.17 · g-lcreations@outlook.fr</div></div>
  <div class="veh">
    <div><span>Client / véhicule</span><b>${esc(e.client || "—")}</b></div>
    <div><span>Marque – année</span><b>${esc([e.brand, e.year].filter(Boolean).join(" – ") || "—")}</b></div>
    <div><span>N° de série (VIN)</span><b>${esc(e.vin || "—")}</b></div>
    <div><span>Kilométrage</span><b>${e.km ? esc(e.km) + " km" : "—"}</b></div>
    <div><span>Tension batterie</span><b>${e.voltage ? fmt(e.voltage, 1) + " V" : "—"}</b></div>
    <div><span>Protocole</span><b>${esc(e.protocol || "—")}</b></div>
  </div>
  <div class="sum"><div><span>${e.truck ? "Défauts J1939" : "Défauts moteur (OBD)"}</span><b class="${nObd ? "bad" : "okc"}">${nObd}</b></div><div><span>Défauts autres calculateurs</span><b class="${nVag ? "bad" : "okc"}">${nVag}</b></div><div><span>Calculateurs lus</span><b>${mods.length}</b></div>${r ? `<div><span>Voyant moteur</span><b class="${r.mil ? "bad" : "okc"}">${r.mil ? "Allumé" : "Éteint"}</b></div>` : ""}</div>
  ${e.notes ? `<h2>Remarques</h2><div class="notes">${esc(e.notes)}</div>` : ""}
  <h2>${e.truck ? "Défauts poids lourd (J1939)" : "Défauts moteur / antipollution (OBD)"}</h2>${obdBlock}
  <h2>Calculateurs</h2>${modBlock}
  ${ff}${m6b}${ready}
  <div class="ft">Rapport généré par G&amp;L Diag${e.demo ? " – MODE DÉMONSTRATION (données simulées)" : ""}. Les codes défaut indiquent la zone de la panne détectée par le calculateur ; un contrôle des composants est nécessaire avant tout remplacement de pièce.</div>
  </body></html>`;
}
