// Diagnostic constructeur groupe VW (VW, Audi, Seat, Škoda, Cupra, MAN TGE)
// via UDS (ISO 14229) sur CAN : véhicules plateforme MQB / MLB evo / Crafter 2017+ (≈ 2013 et plus).
"use strict";
const { dtcCode } = require("./obd.cjs");
const { describeDtc, ftbText } = require("./dtc.cjs");

const hex3 = (n) => n.toString(16).toUpperCase().padStart(3, "0");

// Adresses diagnostic connues (requête → réponse). Réponse = requête + 0x6A sauf moteur/boîte.
const MODULES = [
  { addr: "01", name: "Électronique moteur", req: 0x7e0, resp: 0x7e8 },
  { addr: "02", name: "Électronique de boîte de vitesses", req: 0x7e1, resp: 0x7e9 },
  { addr: "03", name: "Freins (ABS / ESP)", req: 0x713 },
  { addr: "08", name: "Climatisation / chauffage", req: 0x746 },
  { addr: "09", name: "Électronique centrale (BCM)", req: 0x70e },
  { addr: "13", name: "Régulateur de distance (ACC)", req: 0x757 },
  { addr: "15", name: "Airbags", req: 0x715 },
  { addr: "16", name: "Électronique colonne de direction", req: 0x70c },
  { addr: "17", name: "Combiné d'instruments", req: 0x714 },
  { addr: "19", name: "Passerelle de diagnostic (gateway)", req: 0x710 },
  { addr: "44", name: "Direction assistée", req: 0x712 },
  { addr: "5F", name: "Électronique d'information (multimédia)", req: 0x773 },
].map((m) => ({ ...m, resp: m.resp || m.req + 0x6a }));

function ascii(bytes) {
  return String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f)).replace(/\s+/g, " ").trim();
}

// Bits d'état UDS (ISO 14229 annexe D)
function statusInfo(s) {
  return {
    raw: s,
    active: !!(s & 0x01),
    pending: !!(s & 0x04),
    confirmed: !!(s & 0x08),
    warning: !!(s & 0x80),
    label: s & 0x01 ? "Présent (actif)" : s & 0x08 ? "Intermittent / mémorisé" : s & 0x04 ? "En attente (sporadique)" : "Mémorisé",
  };
}

class Vag {
  constructor(elm) { this.elm = elm; }

  modules() { return MODULES.map((m) => ({ ...m, reqHex: hex3(m.req), respHex: hex3(m.resp) })); }

  async ensureCan() {
    if (this.elm.protocol === "6") return;
    if (["7", "8", "9"].includes(this.elm.protocol) || !this.elm.isCan) {
      // Les VW récents sont en CAN 11 bits 500 kbit/s sur la prise OBD
      await this.elm.at("ATSP6");
      this.elm.protocol = "6";
      this.elm.state = {};
    }
  }

  async open(m, quick = false) {
    await this.ensureCan();
    await this.elm.target(hex3(m.req), hex3(m.resp));
    await this.elm.setTimeoutByte(quick ? "19" : "96");
  }

  async readId(m, did) {
    try {
      const r = await this.elm.uds("22" + did, 4000);
      if (r && r[0] === 0x62) return ascii(r.slice(3));
    } catch {}
    return null;
  }

  async identify(m) {
    await this.open(m);
    const name = await this.readId(m, "F197");
    const part = await this.readId(m, "F187");
    if (name === null && part === null) {
      // dernier essai : « Tester present »
      try { const r = await this.elm.uds("3E00", 3000); if (!r) return null; } catch (e) { if (e.nrc === undefined) return null; }
    }
    return {
      systemName: name,
      partNumber: part,
      software: await this.readId(m, "F189"),
      hardware: await this.readId(m, "F191"),
      hwVersion: await this.readId(m, "F1A3"),
      coding: null,
    };
  }

  async readDtcs(m) {
    await this.open(m);
    let r;
    try { r = await this.elm.uds("1902FF", 8000); }
    catch (e) {
      if (e.nrc === 0x31 || e.nrc === 0x12) r = await this.elm.uds("190209", 8000);
      else throw e;
    }
    if (!r || r[0] !== 0x59) return [];
    const out = [];
    for (let i = 3; i + 3 < r.length; i += 4) {
      const [a, b, c, s] = r.slice(i, i + 4);
      if (!a && !b && !c) continue;
      if (!(s & 0x2d)) continue; // ni actif, ni confirmé, ni en attente, ni apparu depuis effacement
      const code = dtcCode(a, b);
      const ftb = ftbText(c);
      out.push({
        code: `${code} ${c.toString(16).toUpperCase().padStart(2, "0")}`,
        base: code,
        ftb: c,
        ftbText: ftb,
        status: statusInfo(s),
        ...describeDtc(code),
      });
    }
    return out;
  }

  async clearDtcs(m) {
    await this.open(m);
    try {
      const r = await this.elm.uds("14FFFFFF", 8000);
      if (r && r[0] === 0x54) return true;
    } catch (e) {
      if (![0x22, 0x7e, 0x7f, 0x33].includes(e.nrc)) throw e;
    }
    // certains calculateurs demandent la session étendue
    await this.elm.uds("1003", 4000);
    const r = await this.elm.uds("14FFFFFF", 8000);
    try { await this.elm.uds("1001", 2000); } catch {}
    if (r && r[0] === 0x54) return true;
    throw new Error("Le calculateur n'a pas confirmé l'effacement.");
  }

  async scanModule(m) {
    const info = await this.identify(m);
    if (!info) return { ...m, reachable: false };
    let dtcs = [], error = null;
    try { dtcs = await this.readDtcs(m); } catch (e) { error = e.message; }
    return { ...m, reqHex: hex3(m.req), respHex: hex3(m.resp), reachable: true, ...info, dtcs, error };
  }

  // Recherche de tous les calculateurs présents (0x700–0x77F, réponse +0x6A)
  async discover(onProgress = () => {}) {
    await this.ensureCan();
    const found = [];
    const start = 0x700, end = 0x77f;
    for (let req = start; req <= end; req++) {
      onProgress((req - start) / (end - start + 1), hex3(req));
      const m = { req, resp: req + 0x6a };
      try {
        await this.open(m, true);
        let r = null;
        try { r = await this.elm.uds("22F197", 1500); } catch (e) { if (e.nrc !== undefined) r = []; }
        if (r) found.push({ req, resp: req + 0x6a, name: r[0] === 0x62 ? ascii(r.slice(3)) : null });
      } catch {}
    }
    onProgress(1, "");
    return found.map((f) => {
      const known = MODULES.find((k) => k.req === f.req);
      return { addr: known ? known.addr : hex3(f.req), name: f.name || (known ? known.name : `Calculateur ${hex3(f.req)}`), req: f.req, resp: f.resp, reqHex: hex3(f.req), respHex: hex3(f.resp) };
    });
  }

  async done() { await this.elm.resetTarget(); }
}

module.exports = { Vag, MODULES, hex3 };
