"use strict";
/* global diag, S, $, $$, esc, fmt, toast, busy, cleanErr, confirmBox, needConn, store */

// ================= PERFORMANCE =================
const PF = { on: false, sup: null, ref: null, baro: null, samples: [], ch: { on: false } };
const vinKey = () => "perf:" + (S.info?.vin || "?");
$("#pfMass").value = store.get("pfMass", 2500);
$("#pfMass").onchange = () => store.set("pfMass", +$("#pfMass").value || 2500);
const runs = () => store.get(vinKey(), []);

async function pfPrepare() {
  if (PF.sup && PF.supVin === S.info?.vin) return;
  const sup = new Set(await diag.supportedRaw());
  PF.sup = sup; PF.supVin = S.info?.vin;
  const once = await diag.readPids([0x63, 0x33].filter((p) => sup.has(p)));
  PF.ref = once[0x63] || null; PF.baro = once[0x33] || 101;
  PF.pids = [0x0c, 0x0d, 0x62, 0x0b, 0x10, 0x70, 0x49, 0x2d, 0x05].filter((p) => sup.has(p));
}
function tile(n, v, u, d = 0) { return `<div class="tile"><div class="n">${esc(n)}</div><div class="v"><span>${v === null || v === undefined ? "—" : fmt(v, d)}</span><small>${esc(u)}</small></div></div>`; }

// puissance : couple réel (% × couple de référence) × régime ; sinon estimation par l'accélération
function power(s, prev, mass) {
  if (s.tq !== null && PF.ref) { const t = (s.tq / 100) * PF.ref; return { t, p: (t * s.rpm) / 9549, how: "couple" }; }
  if (!prev || s.v === null || prev.v === null) return { t: null, p: null };
  const dt = (s.t - prev.t) / 1000, v = s.v / 3.6, a = (s.v - prev.v) / 3.6 / dt;
  const p = (mass * a * v + 0.5 * 1.2 * 3.2 * v ** 3 + mass * 9.81 * 0.012 * v) / 1000; // résistance air (Crafter ≈ 3,2 m²) + roulement
  return { t: s.rpm ? (p * 9549) / s.rpm : null, p, how: "estimation" };
}

$("#pfBtn").onclick = async () => {
  if (PF.on) { PF.on = false; return; }
  if (!needConn()) return;
  try { await pfPrepare(); } catch (e) { return toast(cleanErr(e), true); }
  if (!PF.pids.includes(0x0c)) return toast("Ce moteur ne donne pas son régime en OBD : mesure impossible.", true);
  PF.on = true; PF.samples = []; S.working = true;
  $("#pfBtn").textContent = "■ Arrêter"; $("#pfBtn").classList.remove("primary");
  const mass = +$("#pfMass").value || 2500;
  let peak = 0, prev = null;
  try {
    while (PF.on) {
      const r = await diag.readPids(PF.pids);
      const s = { t: performance.now(), rpm: r[0x0c] ?? 0, v: r[0x0d] ?? null, tq: r[0x62] ?? null, map: r[0x0b] ?? null, maf: r[0x10] ?? null,
        boost: r[0x70] || null, pedal: r[0x49] ?? null, egr: r[0x2d] ?? null, cool: r[0x05] ?? null };
      Object.assign(s, power(s, prev, mass)); prev = s;
      PF.samples.push(s);
      peak = Math.max(peak, s.rpm);
      const boostAct = s.boost?.act ?? s.map;
      $("#pfLive").innerHTML = tile("Régime", s.rpm, "tr/min") + tile("Puissance", s.p != null ? s.p * 1.36 : null, "ch") + tile("Couple", s.t, "Nm") + tile("Turbo (réel)", boostAct != null ? (boostAct - PF.baro) / 100 : null, "bar", 2);
      drawPf(PF.samples, best());
      // fin automatique : le pied est relâché après être monté dans les tours
      const wot = s.pedal == null ? true : s.pedal > 80;
      if (PF.samples.length > 15 && peak > 2500 && (!wot || s.rpm < peak - 600)) break;
      if (PF.samples.length > 3000) break;
    }
  } catch (e) { toast(cleanErr(e), true); }
  PF.on = false; S.working = false;
  $("#pfBtn").textContent = "▶ Démarrer une mesure"; $("#pfBtn").classList.add("primary");
  finishRun();
};

// courbe : maxi par tranche de 100 tr/min, pied à fond seulement
function curve(samples) {
  const bins = new Map();
  for (const s of samples) {
    if (s.p == null || s.p <= 0 || (s.pedal != null && s.pedal < 80)) continue;
    const k = Math.round(s.rpm / 100) * 100;
    const b = bins.get(k);
    if (!b || s.p > b.p) bins.set(k, { rpm: k, p: s.p, t: s.t, boost: s.boost, map: s.map, maf: s.maf, egr: s.egr });
  }
  return [...bins.values()].sort((a, b) => a.rpm - b.rpm);
}
function summary(c) {
  if (!c.length) return null;
  const pm = c.reduce((a, b) => (b.p > a.p ? b : a)), tm = c.reduce((a, b) => (b.t > a.t ? b : a));
  const hi = c.filter((x) => x.rpm >= pm.rpm * 0.7);
  const cmd = hi.map((x) => x.boost?.cmd).filter((x) => x != null), act = hi.map((x) => x.boost?.act ?? x.map).filter((x) => x != null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { pMax: pm.p, pRpm: pm.rpm, tMax: tm.t, tRpm: tm.rpm, boostCmd: avg(cmd), boostAct: avg(act), mafMax: Math.max(...c.map((x) => x.maf ?? 0)) || null,
    egrErr: avg(hi.map((x) => x.egr).filter((x) => x != null)) };
}
const best = () => { const r = runs(); const ref = r.find((x) => x.ref) || r[0]; return ref ? ref.curve : null; };

function drawPf(samples, refCurve) {
  const c = $("#pfChart"), g = c.getContext("2d"), W = c.width, H = c.height, L = 70, R = 70, T = 34, B = 44;
  g.clearRect(0, 0, W, H);
  const cur = curve(samples);
  const all = [...cur, ...(refCurve || [])];
  if (!all.length) { g.fillStyle = "#6b7380"; g.font = "24px Segoe UI"; g.fillText("La courbe apparaît pendant l'accélération pied à fond.", L, H / 2); return; }
  const r0 = Math.min(...all.map((x) => x.rpm)), r1 = Math.max(...all.map((x) => x.rpm), r0 + 500);
  const pM = Math.max(...all.map((x) => x.p * 1.36)) * 1.15, tM = Math.max(...all.map((x) => x.t || 0)) * 1.15 || 1;
  const X = (r) => L + ((r - r0) / (r1 - r0)) * (W - L - R), Yp = (v) => H - B - (v / pM) * (H - T - B), Yt = (v) => H - B - (v / tM) * (H - T - B);
  g.strokeStyle = "#e2e5ea"; g.fillStyle = "#6b7380"; g.font = "22px Segoe UI"; g.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const y = T + (i * (H - T - B)) / 5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(fmt(pM * (1 - i / 5), 0), 8, y + 4); g.fillText(fmt(tM * (1 - i / 5), 0), W - R + 8, y + 4); }
  for (let r = Math.ceil(r0 / 500) * 500; r <= r1; r += 500) g.fillText(r, X(r) - 14, H - 14);
  g.fillText("ch", 8, 14); g.fillText("Nm", W - R + 8, 14);
  const line = (pts, y, color, dash) => { g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); pts.forEach((x, i) => (i ? g.lineTo(X(x.rpm), y(x)) : g.moveTo(X(x.rpm), y(x)))); g.stroke(); g.setLineDash([]); };
  if (refCurve) { line(refCurve, (x) => Yp(x.p * 1.36), "#e8771e88", [8, 6]); line(refCurve.filter((x) => x.t), (x) => Yt(x.t), "#2f6fd188", [8, 6]); }
  line(cur, (x) => Yp(x.p * 1.36), "#e8771e"); line(cur.filter((x) => x.t), (x) => Yt(x.t), "#2f6fd1");
  g.fillStyle = "#e8771e"; g.fillText("■ Puissance", L + 10, T + 14); g.fillStyle = "#2f6fd1"; g.fillText("■ Couple", L + 170, T + 14);
  if (refCurve) { g.fillStyle = "#6b7380"; g.fillText("- - - référence", L + 300, T + 14); }
}

function diagnose(sm, ref) {
  const out = [];
  if (sm.boostCmd && sm.boostAct) {
    const gap = sm.boostCmd - sm.boostAct;
    out.push(gap > 15 ? ["bad", `Turbo : pression réelle inférieure de ${fmt(gap / 100, 2)} bar à la pression demandée. À contrôler : durites et intercooler (fuite), commande du turbo, capteur de pression.`]
      : ["ok", `Turbo : la pression réelle suit la demande (écart ${fmt(gap / 100, 2)} bar).`]);
  }
  if (sm.egrErr != null && Math.abs(sm.egrErr) > 10) out.push(["warn", `EGR : écart moyen de ${fmt(sm.egrErr, 0)} % pendant l'accélération. Vanne EGR ou volets possiblement encrassés.`]);
  if (ref) {
    const dp = ((sm.pMax - ref.pMax) / ref.pMax) * 100;
    out.push(dp < -7 ? ["bad", `Puissance en baisse de ${fmt(-dp, 0)} % par rapport à ta référence.`] : ["ok", `Puissance ${dp >= 0 ? "+" : ""}${fmt(dp, 0)} % par rapport à ta référence.`]);
    if (sm.mafMax && ref.mafMax) {
      const dm = ((sm.mafMax - ref.mafMax) / ref.mafMax) * 100;
      if (dm < -10) out.push(["warn", `Débit d'air maxi en baisse de ${fmt(-dm, 0)} % : filtre à air, débitmètre ou fuite d'admission à vérifier.`]);
    }
  } else out.push(["info", "Première mesure : elle sert de référence pour comparer les suivantes."]);
  return out;
}

function finishRun() {
  const c = curve(PF.samples), sm = summary(c);
  if (!sm) { $("#pfResult").innerHTML = `<p class="err">Pas assez de données pied à fond pour tracer une courbe. Recommence en restant pied au plancher jusqu'au régime maxi.</p>`; return; }
  const all = runs(), refRun = all.find((x) => x.ref) || all[0];
  const how = PF.samples.find((x) => x.how)?.how;
  const run = { date: new Date().toISOString(), curve: c, sm, how, ref: !all.length };
  all.unshift(run); store.set(vinKey(), all.slice(0, 30));
  const d = diagnose(sm, refRun?.sm);
  $("#pfResult").innerHTML = `<div class="kv mt">${[["Puissance maxi", `${fmt(sm.pMax * 1.36, 0)} ch (${fmt(sm.pMax, 0)} kW) à ${sm.pRpm} tr/min`], ["Couple maxi", sm.tMax ? `${fmt(sm.tMax, 0)} Nm à ${sm.tRpm} tr/min` : "—"],
    ["Turbo demandé / réel", sm.boostCmd ? `${fmt((sm.boostCmd - PF.baro) / 100, 2)} / ${fmt((sm.boostAct - PF.baro) / 100, 2)} bar` : sm.boostAct ? `réel ${fmt((sm.boostAct - PF.baro) / 100, 2)} bar` : "—"],
    ["Débit d'air maxi", sm.mafMax ? `${fmt(sm.mafMax, 0)} g/s` : "—"]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    ${how === "estimation" ? `<p class="muted small">Ce moteur ne donne pas son couple réel : puissance estimée à partir de l'accélération et de la masse indiquée (précision ± 10 %).</p>` : `<p class="muted small">Puissance calculée à partir du couple réel transmis par le calculateur moteur.</p>`}
    ${d.map(([c2, t]) => `<div class="dtc ${c2 === "ok" ? "info" : c2 === "warn" ? "warn" : c2 === "info" ? "info" : ""}" style="margin-top:8px"><div class="desc">${esc(t)}</div></div>`).join("")}`;
  renderRuns();
}

function renderRuns() {
  const all = runs();
  $("#pfRuns").innerHTML = all.length ? all.map((r, i) => `<div class="hist"><div class="grow"><b>${fmt(r.sm.pMax * 1.36, 0)} ch · ${r.sm.tMax ? fmt(r.sm.tMax, 0) + " Nm" : "—"}</b>${r.ref ? ' <span class="badge ok">référence</span>' : ""}<small>${new Date(r.date).toLocaleString("fr-FR")}</small></div>
    ${r.ref ? "" : `<button class="btn link" data-pfref="${i}">Choisir comme référence</button>`}<button class="btn link" data-pfdel="${i}">Supprimer</button></div>`).join("") : `<div class="empty" style="margin-top:0">Aucune mesure pour ce véhicule.</div>`;
  $$("[data-pfref]").forEach((b) => (b.onclick = () => { const a = runs(); a.forEach((x, i) => (x.ref = i === +b.dataset.pfref)); store.set(vinKey(), a); renderRuns(); drawPf([], best()); }));
  $$("[data-pfdel]").forEach((b) => (b.onclick = async () => { if (!await confirmBox("Supprimer cette mesure ?", "", "Supprimer")) return; const a = runs(); const was = a[+b.dataset.pfdel].ref; a.splice(+b.dataset.pfdel, 1); if (was && a.length) a[a.length - 1].ref = true; store.set(vinKey(), a); renderRuns(); }));
}
document.querySelector('#nav a[data-page=perf]').addEventListener("click", () => { renderRuns(); if (!PF.on) drawPf([], best()); renderChronos(); });

// ---------- chronos ----------
function renderChronos(cur) {
  const last = store.get(vinKey() + ":chrono", {});
  const show = (k, label) => [label, cur && cur[k] ? `<span style="color:var(--orange)">${fmt(cur[k], 2)} s</span>` : last[k] ? `${fmt(last[k].v, 2)} s${last[k].best && last[k].best < last[k].v ? ` (record ${fmt(last[k].best, 2)} s)` : ""}` : "—"];
  $("#chOut").innerHTML = [show("z50", "0 – 50 km/h"), show("z100", "0 – 100 km/h"), show("r80", "80 – 120 km/h")].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
}
$("#chBtn").onclick = async () => {
  if (PF.ch.on) { PF.ch.on = false; return; }
  if (!needConn()) return;
  PF.ch = { on: true }; S.working = true;
  $("#chBtn").textContent = "■ Arrêter"; renderChronos({});
  const res = {}; let t0 = null, t80 = null, prev = null;
  try {
    while (PF.ch.on) {
      const r = await diag.readPids([0x0d]); const v = r[0x0d]; const t = performance.now();
      if (v == null) continue;
      // interpolation entre deux lectures pour plus de précision
      const cross = (lim) => (prev && prev.v < lim && v >= lim ? prev.t + ((lim - prev.v) / (v - prev.v)) * (t - prev.t) : null);
      if (v === 0) { t0 = null; }
      else if (prev && prev.v === 0 && t0 === null) t0 = prev.t;
      if (t0 !== null) { const c50 = cross(50), c100 = cross(100); if (c50) res.z50 = (c50 - t0) / 1000; if (c100) res.z100 = (c100 - t0) / 1000; }
      const c80 = cross(80); if (c80) t80 = c80;
      if (prev && v < 75) t80 = null;
      const c120 = cross(120); if (c120 && t80) res.r80 = (c120 - t80) / 1000;
      prev = { v, t };
      renderChronos(res);
      if (res.z100 && res.r80) break;
    }
  } catch (e) { toast(cleanErr(e), true); }
  const last = store.get(vinKey() + ":chrono", {});
  for (const k of Object.keys(res)) last[k] = { v: res[k], best: Math.min(res[k], last[k]?.best ?? Infinity) };
  store.set(vinKey() + ":chrono", last);
  PF.ch.on = false; S.working = false; $("#chBtn").textContent = "▶ Armer les chronos"; renderChronos();
};
