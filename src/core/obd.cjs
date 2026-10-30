// OBD-II générique (SAE J1979) : toutes marques depuis 2001 (essence) / 2004 (diesel).
"use strict";
const { describeDtc } = require("./dtc.cjs");

const u16 = (a, b) => (a << 8) | b;

// Paramètres en direct (mode 01). n = nombre d'octets de données.
const PIDS = {
  0x04: { name: "Charge moteur calculée", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x05: { name: "Température liquide de refroidissement", unit: "°C", n: 1, f: (d) => d[0] - 40, min: -40, max: 130 },
  0x06: { name: "Correction carburant court terme (banc 1)", unit: "%", n: 1, f: (d) => ((d[0] - 128) * 100) / 128, min: -25, max: 25 },
  0x07: { name: "Correction carburant long terme (banc 1)", unit: "%", n: 1, f: (d) => ((d[0] - 128) * 100) / 128, min: -25, max: 25 },
  0x0a: { name: "Pression carburant", unit: "kPa", n: 1, f: (d) => d[0] * 3, max: 765 },
  0x0b: { name: "Pression collecteur d'admission (MAP)", unit: "kPa", n: 1, f: (d) => d[0], max: 255 },
  0x0c: { name: "Régime moteur", unit: "tr/min", n: 2, f: (d) => u16(d[0], d[1]) / 4, max: 6000, dec: 0 },
  0x0d: { name: "Vitesse du véhicule", unit: "km/h", n: 1, f: (d) => d[0], max: 200, dec: 0 },
  0x0e: { name: "Avance à l'allumage", unit: "°", n: 1, f: (d) => d[0] / 2 - 64, min: -20, max: 60 },
  0x0f: { name: "Température air d'admission", unit: "°C", n: 1, f: (d) => d[0] - 40, min: -40, max: 100 },
  0x10: { name: "Débit d'air (débitmètre MAF)", unit: "g/s", n: 2, f: (d) => u16(d[0], d[1]) / 100, max: 300 },
  0x11: { name: "Position papillon", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x14: { name: "Sonde O2 banc 1 capteur 1", unit: "V", n: 2, f: (d) => d[0] / 200, max: 1.275, dec: 3 },
  0x15: { name: "Sonde O2 banc 1 capteur 2", unit: "V", n: 2, f: (d) => d[0] / 200, max: 1.275, dec: 3 },
  0x1f: { name: "Temps depuis démarrage moteur", unit: "s", n: 2, f: (d) => u16(d[0], d[1]), max: 3600, dec: 0 },
  0x21: { name: "Distance parcourue avec voyant moteur allumé", unit: "km", n: 2, f: (d) => u16(d[0], d[1]), dec: 0 },
  0x22: { name: "Pression rampe carburant (relative)", unit: "kPa", n: 2, f: (d) => u16(d[0], d[1]) * 0.079 },
  0x23: { name: "Pression rampe carburant", unit: "bar", n: 2, f: (d) => (u16(d[0], d[1]) * 10) / 100, max: 2500, dec: 0 },
  0x2c: { name: "Vanne EGR commandée", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x2d: { name: "Erreur EGR", unit: "%", n: 1, f: (d) => ((d[0] - 128) * 100) / 128, min: -100, max: 100 },
  0x2f: { name: "Niveau de carburant", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x30: { name: "Démarrages à chaud depuis effacement", unit: "", n: 1, f: (d) => d[0], dec: 0 },
  0x31: { name: "Distance depuis effacement des défauts", unit: "km", n: 2, f: (d) => u16(d[0], d[1]), dec: 0 },
  0x33: { name: "Pression atmosphérique", unit: "kPa", n: 1, f: (d) => d[0], max: 120, dec: 0 },
  0x3c: { name: "Température catalyseur", unit: "°C", n: 2, f: (d) => u16(d[0], d[1]) / 10 - 40, max: 900, dec: 0 },
  0x42: { name: "Tension calculateur (batterie)", unit: "V", n: 2, f: (d) => u16(d[0], d[1]) / 1000, min: 10, max: 15.5, dec: 2 },
  0x43: { name: "Charge absolue", unit: "%", n: 2, f: (d) => (u16(d[0], d[1]) * 100) / 255, max: 200 },
  0x44: { name: "Lambda commandée", unit: "λ", n: 2, f: (d) => (2 / 65536) * u16(d[0], d[1]), max: 2, dec: 3 },
  0x45: { name: "Position relative papillon", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x46: { name: "Température extérieure", unit: "°C", n: 1, f: (d) => d[0] - 40, min: -40, max: 60 },
  0x49: { name: "Position pédale d'accélérateur", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x4c: { name: "Papillon commandé", unit: "%", n: 1, f: (d) => (d[0] * 100) / 255, max: 100 },
  0x4d: { name: "Temps avec voyant moteur allumé", unit: "min", n: 2, f: (d) => u16(d[0], d[1]), dec: 0 },
  0x4e: { name: "Temps depuis effacement des défauts", unit: "min", n: 2, f: (d) => u16(d[0], d[1]), dec: 0 },
  0x5c: { name: "Température huile moteur", unit: "°C", n: 1, f: (d) => d[0] - 40, min: -40, max: 150 },
  0x5e: { name: "Consommation instantanée", unit: "L/h", n: 2, f: (d) => u16(d[0], d[1]) / 20, max: 30 },
  0x61: { name: "Couple demandé par le conducteur", unit: "%", n: 1, f: (d) => d[0] - 125, min: -125, max: 130, dec: 0 },
  0x62: { name: "Couple moteur réel", unit: "%", n: 1, f: (d) => d[0] - 125, min: -125, max: 130, dec: 0 },
  0x63: { name: "Couple de référence moteur", unit: "Nm", n: 2, f: (d) => u16(d[0], d[1]), dec: 0 },
  0xa6: { name: "Kilométrage (compteur)", unit: "km", n: 4, f: (d) => ((d[0] * 2 ** 24) + (d[1] << 16) + (d[2] << 8) + d[3]) / 10, dec: 0 },
};

const FREEZE_PIDS = [0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x1f, 0x23, 0x2f, 0x33, 0x42, 0x46, 0x5c];

function bitmapPids(bytes, base) {
  const out = [];
  for (let i = 0; i < 32; i++) {
    const byte = bytes[i >> 3];
    if (byte & (0x80 >> (i & 7))) out.push(base + i + 1);
  }
  return out;
}

// Décodage d'un code défaut SAE sur 2 octets
function dtcCode(a, b) {
  return "PCBU"[a >> 6] + ((a >> 4) & 3) + (a & 0xf).toString(16).toUpperCase() + (b >> 4).toString(16).toUpperCase() + (b & 0xf).toString(16).toUpperCase();
}

function firstPerEcu(msgs, sid) {
  const by = new Map();
  for (const m of msgs) if (m.data[0] === sid && !by.has(m.id)) by.set(m.id, m.data);
  return by;
}

class Obd {
  constructor(elm) {
    this.elm = elm;
    this.supported = null;
  }

  async supportedPids() {
    if (this.supported) return this.supported;
    const set = new Set();
    for (const base of [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0]) {
      if (base && !set.has(base)) break;
      let msgs;
      try { msgs = await this.elm.request("01" + base.toString(16).padStart(2, "0").toUpperCase()); } catch { break; }
      const got = msgs.filter((m) => m.data[0] === 0x41 && m.data[1] === base);
      if (!got.length) break;
      for (const m of got) for (const p of bitmapPids(m.data.slice(2, 6), base)) set.add(p);
    }
    this.supported = [...set].sort((a, b) => a - b);
    return this.supported;
  }

  // Lit plusieurs PID ; en CAN on groupe par 6 dans une seule requête.
  async readPids(pids) {
    const res = {};
    const groups = [];
    const size = this.elm.isCan && !this.noMulti ? 6 : 1;
    for (let i = 0; i < pids.length; i += size) groups.push(pids.slice(i, i + size));
    for (const g of groups) {
      const hex = "01" + g.map((p) => p.toString(16).padStart(2, "0").toUpperCase()).join("");
      let msgs;
      try { msgs = await this.elm.request(hex, 3000); } catch (e) { continue; }
      for (const m of msgs) {
        if (m.data[0] !== 0x41) continue;
        let i = 1;
        while (i < m.data.length) {
          const pid = m.data[i];
          const def = PIDS[pid];
          const n = def ? def.n : 4;
          const d = m.data.slice(i + 1, i + 1 + n);
          if (def && d.length === n && res[pid] === undefined) res[pid] = def.f(d);
          i += 1 + n;
          if (size === 1) break;
        }
      }
      // si le groupage échoue sur cette voiture, on repasse en PID par PID
      if (size > 1 && g.length > 1 && g.every((p) => res[p] === undefined)) {
        this.noMulti = true;
        return this.readPids(pids);
      }
    }
    return res;
  }

  async readDtcs(mode) {
    const sid = { "03": 0x43, "07": 0x47, "0A": 0x4a }[mode];
    const msgs = await this.elm.request(mode, 8000);
    const codes = [];
    for (const m of msgs) {
      if (m.data[0] !== sid) continue;
      let d = m.data.slice(1);
      if (this.elm.isCan) d = d.slice(1); // octet de comptage
      for (let i = 0; i + 1 < d.length; i += 2) {
        if (!d[i] && !d[i + 1]) continue;
        const code = dtcCode(d[i], d[i + 1]);
        if (!codes.find((c) => c.code === code)) codes.push({ code, ecu: m.id, ...describeDtc(code) });
      }
    }
    return codes;
  }

  async readAllDtcs() {
    const stored = await this.readDtcs("03");
    let pending = [], permanent = [];
    try { pending = await this.readDtcs("07"); } catch {}
    try { permanent = await this.readDtcs("0A"); } catch {}
    return { stored, pending, permanent };
  }

  async clearDtcs() {
    const msgs = await this.elm.request("04", 10000);
    const ok = msgs.some((m) => m.data[0] === 0x44);
    if (!ok) throw new Error("La voiture a refusé l'effacement. Mets le contact, moteur arrêté, puis réessaie.");
    this.supported = null;
    return true;
  }

  async vin() {
    const msgs = await this.elm.request("0902", 8000);
    let bytes = [];
    for (const m of msgs) {
      if (m.data[0] !== 0x49 || m.data[1] !== 0x02) continue;
      bytes.push(...m.data.slice(this.elm.isCan ? 3 : 3));
      if (this.elm.isCan) break;
    }
    const s = String.fromCharCode(...bytes.filter((b) => b >= 0x30 && b <= 0x5a));
    return s.length >= 17 ? s.slice(-17) : s || null;
  }

  async ecuNames() {
    try {
      const msgs = await this.elm.request("090A", 6000);
      const out = {};
      for (const m of msgs) {
        if (m.data[0] !== 0x49 || m.data[1] !== 0x0a) continue;
        out[m.id] = String.fromCharCode(...m.data.slice(3).filter((b) => b >= 0x20 && b < 0x7f)).replace(/\s+/g, " ").trim();
      }
      return out;
    } catch { return {}; }
  }

  async readiness() {
    const msgs = await this.elm.request("0101");
    const d = [...firstPerEcu(msgs, 0x41).values()].find((x) => x[1] === 0x01);
    if (!d) throw new Error("Le calculateur moteur ne donne pas l'état des tests antipollution.");
    const [A, B, C, D] = d.slice(2, 6);
    const diesel = !!(B & 0x08);
    const mon = (name, sup, inc) => ({ name, supported: !!sup, complete: !!sup && !inc });
    const list = [
      mon("Ratés de combustion", B & 0x01, B & 0x10),
      mon("Système d'alimentation carburant", B & 0x02, B & 0x20),
      mon("Composants (capteurs/actionneurs)", B & 0x04, B & 0x40),
    ];
    const names = diesel
      ? ["Catalyseur NMHC", "Réduction NOx / SCR (AdBlue)", null, "Pression de suralimentation", null, "Capteur gaz d'échappement", "Filtre à particules (FAP)", "EGR / distribution variable"]
      : ["Catalyseur", "Catalyseur chauffé", "Système EVAP (vapeurs essence)", "Air secondaire", null, "Sonde lambda (O2)", "Chauffage sonde lambda", "EGR / distribution variable"];
    names.forEach((n, i) => { if (n) list.push(mon(n, C & (1 << i), D & (1 << i))); });
    let extra = {};
    try { extra = await this.readPids([0x21, 0x31, 0x30, 0x4e]); } catch {}
    return {
      mil: !!(A & 0x80),
      dtcCount: A & 0x7f,
      diesel,
      monitors: list.filter((m) => m.supported),
      distanceMil: extra[0x21],
      distanceSinceClear: extra[0x31],
      warmups: extra[0x30],
      minutesSinceClear: extra[0x4e],
    };
  }

  async freezeFrame() {
    const out = { dtc: null, values: [] };
    try {
      const msgs = await this.elm.request("020200");
      const d = [...firstPerEcu(msgs, 0x42).values()][0];
      if (d && (d[3] || d[4])) out.dtc = { code: dtcCode(d[3], d[4]), ...describeDtc(dtcCode(d[3], d[4])) };
    } catch {}
    if (!out.dtc) return out;
    for (const pid of FREEZE_PIDS) {
      try {
        const msgs = await this.elm.request("02" + pid.toString(16).padStart(2, "0").toUpperCase() + "00", 2500);
        const d = [...firstPerEcu(msgs, 0x42).values()][0];
        if (!d || d[1] !== pid) continue;
        const def = PIDS[pid];
        const val = def.f(d.slice(3, 3 + def.n));
        out.values.push({ pid, name: def.name, unit: def.unit, value: val, dec: def.dec });
      } catch {}
    }
    return out;
  }
}

// Décodage du VIN : marque et année modèle
const WMI = {
  WVW: "Volkswagen", WV1: "Volkswagen Utilitaires", WV2: "Volkswagen Utilitaires", WV3: "Volkswagen Utilitaires",
  WAU: "Audi", WUA: "Audi Sport", TRU: "Audi (Hongrie)", WA1: "Audi SUV",
  VSS: "Seat", VS6: "Seat", VSE: "Seat", TMB: "Škoda", TMP: "Škoda",
  WMA: "MAN", WMM: "MAN", WMH: "MAN", WP0: "Porsche", WP1: "Porsche SUV",
  "3VW": "Volkswagen (Mexique)", "1VW": "Volkswagen (USA)", "9BW": "Volkswagen (Brésil)", AAV: "Volkswagen (Afrique du Sud)",
  VF1: "Renault", VF3: "Peugeot", VF7: "Citroën", VR3: "Peugeot", VR7: "Citroën", VNK: "Toyota", WDB: "Mercedes-Benz",
  WDD: "Mercedes-Benz", W1K: "Mercedes-Benz", W1V: "Mercedes-Benz Utilitaires", WDF: "Mercedes-Benz Utilitaires", WBA: "BMW",
  WF0: "Ford", ZFA: "Fiat", ZFF: "Ferrari", VF6: "Renault Trucks", YV1: "Volvo", SB1: "Toyota", KNA: "Kia", KMH: "Hyundai",
  TMA: "Hyundai", VSK: "Nissan", SJN: "Nissan", W0L: "Opel", W0V: "Opel", ZAR: "Alfa Romeo", UU1: "Dacia", "5YJ": "Tesla", LRW: "Tesla", XP7: "Tesla",
};
const VAG = /Volkswagen|Audi|Seat|Škoda|MAN|Porsche|Cupra/;
const YEARS = "ABCDEFGHJKLMNPRSTVWXY123456789";
function decodeVin(vin) {
  if (!vin || vin.length < 17) return { brand: null, year: null, vag: false };
  const brand = WMI[vin.slice(0, 3)] || null;
  const c = vin[9];
  let year = null;
  const i = YEARS.indexOf(c);
  if (i >= 0) {
    year = 1980 + i;
    while (year + 30 <= new Date().getFullYear() + 1) year += 30;
  }
  return { brand, year, vag: !!brand && VAG.test(brand) };
}

module.exports = { Obd, PIDS, dtcCode, decodeVin, FREEZE_PIDS };
