// Poids lourds / bus (MAN TGL, TGM, TGS, TGX, Lion's… et autres camions J1939)
//  - J1939 : défauts actifs (DM1), défauts passés (DM2), effacement (DM11), données en direct
//  - UDS sur CAN 29 bits : identification et défauts de chaque calculateur (adresse J1939)
"use strict";
const { spnText, fmiText } = require("./spn.cjs");

const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// Calculateurs (adresses source J1939 standard)
const TRUCK_MODULES = [
  ["00", "Électronique moteur (EDC)"], ["03", "Boîte de vitesses (TipMatic)"], ["0B", "Freinage EBS / ABS"],
  ["0F", "Frein moteur / ralentisseur moteur"], ["10", "Ralentisseur (Intarder)"], ["17", "Combiné d'instruments"],
  ["19", "Climatisation"], ["21", "Calculateur carrosserie (ZBR / BCM)"], ["2A", "Régulateur de distance (ACC)"],
  ["2F", "Suspension pneumatique (ECAS)"], ["31", "Calculateur cabine"], ["3D", "Post-traitement (SCR / AdBlue / FAP)"],
  ["EE", "Chronotachygraphe"],
].map(([sa, name]) => ({ addr: sa, name, sa: parseInt(sa, 16), truck: true }));

// Données en direct J1939 (identifiants > 1000 pour ne pas se mélanger avec l'OBD)
const u16 = (d, i) => d[i] | (d[i + 1] << 8);
const u32 = (d, i) => (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)) + d[i + 3] * 2 ** 24;
const ok8 = (v) => v < 0xfb; const ok16 = (v) => v < 0xfb00;
const J = {
  1001: { pgn: 0xf004, name: "Régime moteur", unit: "tr/min", f: (d) => ok16(u16(d, 3)) ? u16(d, 3) * 0.125 : null, max: 2500, dec: 0 },
  1002: { pgn: 0xf004, name: "Couple moteur réel", unit: "%", f: (d) => ok8(d[2]) ? d[2] - 125 : null, min: -125, max: 125, dec: 0 },
  1016: { pgn: 0xf003, name: "Position pédale d'accélérateur", unit: "%", f: (d) => ok8(d[1]) ? d[1] * 0.4 : null, max: 100, dec: 0 },
  1017: { pgn: 0xf003, name: "Charge moteur", unit: "%", f: (d) => ok8(d[2]) ? d[2] : null, max: 125, dec: 0 },
  1003: { pgn: 0xfef1, name: "Vitesse du véhicule", unit: "km/h", f: (d) => ok16(u16(d, 1)) ? u16(d, 1) / 256 : null, max: 120, dec: 0 },
  1004: { pgn: 0xfeee, name: "Température liquide de refroidissement", unit: "°C", f: (d) => ok8(d[0]) ? d[0] - 40 : null, min: -40, max: 120, dec: 0 },
  1005: { pgn: 0xfeee, name: "Température huile moteur", unit: "°C", f: (d) => ok16(u16(d, 2)) ? u16(d, 2) * 0.03125 - 273 : null, min: -40, max: 140, dec: 0 },
  1006: { pgn: 0xfeef, name: "Pression d'huile moteur", unit: "bar", f: (d) => ok8(d[3]) ? (d[3] * 4) / 100 : null, max: 8, dec: 1 },
  1007: { pgn: 0xfef6, name: "Pression de suralimentation", unit: "bar", f: (d) => ok8(d[1]) ? (d[1] * 2) / 100 : null, max: 4, dec: 2 },
  1008: { pgn: 0xfef6, name: "Température air d'admission", unit: "°C", f: (d) => ok8(d[2]) ? d[2] - 40 : null, min: -40, max: 100, dec: 0 },
  1009: { pgn: 0xfef7, name: "Tension batterie", unit: "V", f: (d) => ok16(u16(d, 4)) ? u16(d, 4) * 0.05 : null, min: 20, max: 30, dec: 1 },
  1010: { pgn: 0xfefc, name: "Niveau de carburant", unit: "%", f: (d) => ok8(d[1]) ? d[1] * 0.4 : null, max: 100, dec: 0 },
  1011: { pgn: 0xfef2, name: "Consommation instantanée", unit: "L/h", f: (d) => ok16(u16(d, 0)) ? u16(d, 0) * 0.05 : null, max: 80, dec: 1 },
  1012: { pgn: 0xfe56, name: "Niveau AdBlue", unit: "%", f: (d) => ok8(d[0]) ? d[0] * 0.4 : null, max: 100, dec: 0 },
  1013: { pgn: 0xfef5, name: "Température extérieure", unit: "°C", f: (d) => ok16(u16(d, 3)) ? u16(d, 3) * 0.03125 - 273 : null, min: -30, max: 50, dec: 0 },
  1014: { pgn: 0xfee5, name: "Heures moteur", unit: "h", f: (d) => u32(d, 0) < 0xfb000000 ? u32(d, 0) * 0.05 : null, dec: 0 },
  1015: { pgn: 0xfee0, name: "Kilométrage total", unit: "km", f: (d) => u32(d, 4) < 0xfb000000 ? u32(d, 4) * 0.125 : null, dec: 0 },
  1018: { pgn: 0xfeae, name: "Pression air freins (circuit 1)", unit: "bar", f: (d) => ok8(d[2]) ? (d[2] * 8) / 100 : null, max: 13, dec: 1 },
  1019: { pgn: 0xfd7b, name: "Charge en suie du FAP", unit: "%", f: (d) => ok8(d[0]) ? d[0] : null, max: 100, dec: 0 },
};

// Décodage d'un identifiant 29 bits J1939
function jid(idHex) {
  const b = idHex.match(/../g).map((x) => parseInt(x, 16));
  const pf = b[1], ps = b[2];
  return { pgn: ((b[0] & 1) << 16) | (pf << 8) | (pf >= 0xf0 ? ps : 0), pf, ps, sa: b[3] };
}

// Regroupe les trames : messages directs + messages longs (BAM / transport)
function assemble(frames, wanted) {
  const out = []; // { sa, pgn, data }
  const tp = new Map();
  for (const f of frames) {
    if (f.id.length !== 8) continue;
    const j = jid(f.id), d = f.data;
    if (j.pf === 0xec && (d[0] === 0x20 || d[0] === 0x10)) {
      tp.set(j.sa, { size: d[1] | (d[2] << 8), pgn: d[5] | (d[6] << 8) | (d[7] << 16), parts: [] });
    } else if (j.pf === 0xeb) {
      const t = tp.get(j.sa);
      if (!t) continue;
      t.parts[d[0] - 1] = d.slice(1, 8);
      const got = t.parts.filter(Boolean).length;
      if (got * 7 >= t.size) {
        out.push({ sa: j.sa, pgn: t.pgn, data: t.parts.flat().slice(0, t.size) });
        tp.delete(j.sa);
      }
    } else out.push({ sa: j.sa, pgn: j.pgn, data: d });
  }
  return wanted === undefined ? out : out.filter((m) => m.pgn === wanted);
}

// Défauts DM1/DM2 : lampes + liste SPN/FMI
function decodeDm(msg) {
  const d = msg.data;
  const lamp = (b, shift) => ((b >> shift) & 3) === 1;
  const res = { sa: msg.sa, mil: lamp(d[0], 6), red: lamp(d[0], 4), amber: lamp(d[0], 2), protect: lamp(d[0], 0), dtcs: [] };
  for (let i = 2; i + 3 < d.length; i += 4) {
    const spn = d[i] | (d[i + 1] << 8) | ((d[i + 2] >> 5) << 16);
    const fmi = d[i + 2] & 0x1f;
    const oc = d[i + 3] & 0x7f;
    if ((spn === 0 && fmi === 0) || spn === 0x7ffff) continue;
    res.dtcs.push(spnDtc(spn, fmi, oc, msg.sa));
  }
  return res;
}
function spnDtc(spn, fmi, oc, sa) {
  const mod = TRUCK_MODULES.find((m) => m.sa === sa);
  return {
    code: `SPN ${spn} – FMI ${fmi}`, spn, fmi, count: oc,
    description: spnText(spn) ? `${spnText(spn)} – ${fmiText(fmi).toLowerCase()}` : null,
    category: spnText(spn) ? "Poids lourd (J1939)" : `Paramètre constructeur – ${fmiText(fmi).toLowerCase()}`, ftbText: null,
    ecu: mod ? mod.name : `adresse ${h2(sa)}`,
  };
}

class Hd {
  constructor(elm) { this.elm = elm; this.rate = 250; }

  // Recherche du bus du camion : J1939 250 kbit/s puis 500 kbit/s
  async init() {
    await this.elm.reset();
    try { await this.elm.at("ATJHF0"); } catch {}
    const tries = [["250", ["ATSPA"]], ["500", ["ATPB4201", "ATSPB"]]];
    for (const [rate, cmds] of tries) {
      for (const c of cmds) await this.elm.at(c);
      this.elm.protocol = cmds[cmds.length - 1].slice(-1);
      let frames = [];
      try { frames = await this.elm.monitor("ATMA", 700); } catch {}
      if (frames.some((f) => f.id.length === 8)) {
        this.rate = Number(rate);
        return { version: this.elm.version, protocol: this.elm.protocol, protocolName: `SAE J1939 (29 bits, ${rate} kbit/s) – poids lourd` };
      }
    }
    throw new Error("Aucun bus poids lourd détecté. Vérifie : contact mis, adaptateur compatible 24 V branché sur la prise diagnostic du camion, et que l'adaptateur gère le J1939 (les petits ELM327 v1.5 bas de gamme ne le gèrent souvent pas).");
  }

  async j1939() {
    const p = this.rate === 500 ? "B" : "A";
    if (this.elm.protocol !== p) {
      await this.elm.resetTarget();
      await this.elm.at("ATSP" + p); this.elm.protocol = p;
      // en-tête de requête J1939 standard (PGN EA00 vers tous, depuis l'outil F9)
      await this.elm.at("ATCP18"); await this.elm.at("ATSHEAFFF9");
      this.elm.state = {};
    }
  }
  async iso29() {
    const p = this.rate === 500 ? "7" : "9";
    if (this.elm.protocol !== p) { await this.elm.at("ATSP" + p); this.elm.protocol = p; this.elm.state = {}; }
  }

  // Demande d'un PGN (l'ELM327 attend les octets du PGN à l'envers)
  async requestPgn(pgn, ms = 1500) {
    await this.j1939();
    const hex = h2(pgn & 0xff) + h2((pgn >> 8) & 0xff) + h2(pgn >> 16);
    try { return assemble(await this.elm.request(hex, ms), pgn); } catch { return []; }
  }
  async listenPgn(pgn, ms) {
    await this.j1939();
    const hex = ((pgn >> 8) & 0xff).toString(16).toUpperCase().padStart(2, "0") + h2(pgn & 0xff);
    try { return assemble(await this.elm.monitor("ATMP" + hex, ms), pgn); } catch { return []; }
  }

  async vin() {
    let m = await this.requestPgn(0xfeec, 2500);
    if (!m.length) m = await this.listenPgn(0xfeec, 1500);
    if (m.length) {
      const s = String.fromCharCode(...m[0].data).split("*")[0].replace(/[^A-Z0-9]/gi, "");
      if (s.length >= 17) return s.slice(0, 17);
    }
    // plan B : UDS sur le calculateur moteur
    try {
      await this.open(0x00);
      const r = await this.elm.uds("22F190", 4000);
      if (r && r[0] === 0x62) return String.fromCharCode(...r.slice(3).filter((b) => b > 0x20 && b < 0x7f)).slice(0, 17);
    } catch {}
    return null;
  }

  async readDtcs() {
    await this.j1939();
    // DM1 : diffusé chaque seconde par chaque calculateur qui a un défaut actif
    let frames = [];
    try { frames = await this.elm.monitor("ATDM1", 2600); } catch {}
    const active = assemble(frames, 0xfeca).map(decodeDm);
    const previous = (await this.requestPgn(0xfecb, 2500)).map(decodeDm);
    const flat = (l) => { const seen = new Set(); return l.flatMap((x) => x.dtcs).filter((d) => { const k = d.code + d.ecu; if (seen.has(k)) return false; seen.add(k); return true; }); };
    return {
      stored: flat(active), pending: [], permanent: [], previous: flat(previous),
      lamps: { mil: active.some((a) => a.mil), red: active.some((a) => a.red), amber: active.some((a) => a.amber) },
    };
  }

  async clearDtcs() {
    // DM11 (actifs + passés) puis DM3 (passés)
    await this.requestPgn(0xfed3, 2500);
    await this.requestPgn(0xfecc, 2500);
    return true;
  }

  params() {
    return Object.entries(J).map(([id, p]) => ({ pid: Number(id), name: p.name, unit: p.unit, min: p.min ?? 0, max: p.max ?? null, dec: p.dec ?? 1 }));
  }

  async readParams(ids) {
    const byPgn = new Map();
    for (const id of ids) { const p = J[id]; if (p) (byPgn.get(p.pgn) || byPgn.set(p.pgn, []).get(p.pgn)).push(id); }
    const res = {};
    for (const [pgn, list] of byPgn) {
      let m = this.noRequest?.has(pgn) ? [] : await this.requestPgn(pgn, 600);
      if (!m.length) {
        (this.noRequest = this.noRequest || new Set()).add(pgn);
        m = await this.listenPgn(pgn, pgn >= 0xfe00 ? 1100 : 250);
      }
      const msg = m.find((x) => x.sa === 0x00) || m[0];
      if (!msg) continue;
      for (const id of list) { const v = J[id].f(msg.data); if (v !== null && v !== undefined) res[id] = v; }
    }
    return res;
  }

  // ---- UDS sur CAN 29 bits (adressage normal fixe 18DA) ----
  async open(sa, quick = false) {
    await this.iso29();
    await this.elm.target(`18DA${h2(sa)}F1`, `18DAF1${h2(sa)}`);
    await this.elm.setTimeoutByte(quick ? "19" : "96");
  }

  async udsId(did) {
    try { const r = await this.elm.uds("22" + did, 4000); if (r && r[0] === 0x62) return String.fromCharCode(...r.slice(3).filter((b) => b >= 0x20 && b < 0x7f)).trim(); } catch {}
    return null;
  }

  async scanModule(m) {
    await this.open(m.sa);
    const systemName = await this.udsId("F197");
    const partNumber = await this.udsId("F187");
    let alive = systemName !== null || partNumber !== null;
    if (!alive) { try { alive = !!(await this.elm.uds("3E00", 3000)); } catch (e) { alive = e.nrc !== undefined; } }
    // repli J1939 : le calculateur publie-t-il des défauts DM1 ?
    if (!alive) return { ...m, reachable: false };
    const info = { ...m, reachable: true, reqHex: `18DA${m.addr}F1`, respHex: `18DAF1${m.addr}`, systemName, partNumber,
      software: await this.udsId("F195") || await this.udsId("F189"), hardware: await this.udsId("F193") || await this.udsId("F191"), hwVersion: null };
    try { info.dtcs = await this.udsDtcs(m); } catch (e) { info.dtcs = []; info.error = e.message; }
    return info;
  }

  async udsDtcs(m) {
    await this.open(m.sa);
    let format = 0x01;
    try { const f = await this.elm.uds("1901FF", 4000); if (f && f[0] === 0x59) format = f[3]; } catch {}
    const r = await this.elm.uds("1902FF", 8000);
    if (!r || r[0] !== 0x59) return [];
    const out = [];
    for (let i = 3; i + 3 < r.length; i += 4) {
      const [a, b, c, s] = r.slice(i, i + 4);
      if (!(s & 0x2d) || (!a && !b && !c)) continue;
      let d;
      if (format === 0x02) {
        // SAE J1939-73 : SPN 19 bits + FMI 5 bits
        d = spnDtc(a | (b << 8) | ((c >> 5) << 16), c & 0x1f, 0, m.sa);
      } else {
        const { dtcCode } = require("./obd.cjs");
        const { describeDtc, ftbText } = require("./dtc.cjs");
        const code = dtcCode(a, b);
        d = { code: `${code} ${h2(c)}`, base: code, ftbText: ftbText(c), ...describeDtc(code) };
      }
      d.base = d.base || `SPN ${d.spn} FMI ${d.fmi}`;
      d.status = { raw: s, active: !!(s & 1), warning: !!(s & 0x80), label: s & 1 ? "Présent (actif)" : s & 8 ? "Intermittent / mémorisé" : "En attente (sporadique)" };
      out.push(d);
    }
    return out;
  }

  async clearModule(m) {
    await this.open(m.sa);
    try { const r = await this.elm.uds("14FFFFFF", 8000); if (r && r[0] === 0x54) return true; }
    catch (e) { if (![0x22, 0x7e, 0x7f].includes(e.nrc)) throw e; }
    await this.elm.uds("1003", 4000);
    const r = await this.elm.uds("14FFFFFF", 8000);
    if (r && r[0] === 0x54) return true;
    throw new Error("Le calculateur n'a pas confirmé l'effacement.");
  }

  async discover(onProgress = () => {}) {
    const found = [];
    for (let sa = 0; sa <= 0xfd; sa++) {
      onProgress(sa / 0xfe, h2(sa));
      try {
        await this.open(sa, true);
        let r = null;
        try { r = await this.elm.uds("22F197", 1500); } catch (e) { if (e.nrc !== undefined) r = []; }
        if (r) {
          const known = TRUCK_MODULES.find((k) => k.sa === sa);
          const name = r[0] === 0x62 ? String.fromCharCode(...r.slice(3).filter((b) => b >= 0x20 && b < 0x7f)).trim() : null;
          found.push({ addr: h2(sa), sa, truck: true, name: known ? known.name : name || `Calculateur ${h2(sa)}` });
        }
      } catch {}
    }
    onProgress(1, "");
    return found;
  }

  async done() { await this.elm.resetTarget(); }
}

module.exports = { Hd, TRUCK_MODULES, J, assemble, decodeDm };
