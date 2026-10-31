// Tesla Model 3 / Model Y (et décodage DBC de n'importe quel véhicule).
// Tesla n'ouvre pas son diagnostic aux outils du commerce : on lit les trames qui circulent
// sur le bus véhicule (prise diagnostic via câble adaptateur) et on les décode avec le DBC
// communautaire « model3dbc » (licence MIT).
"use strict";
const fs = require("fs");
const path = require("path");
const { parseDbc, decodeMsg } = require("./dbc.cjs");

let TESLA_DBC = null;
function teslaDbc() {
  if (!TESLA_DBC) TESLA_DBC = parseDbc(fs.readFileSync(path.join(__dirname, "..", "..", "data", "tesla-model3y.dbc"), "utf8"));
  return TESLA_DBC;
}

// Trames lues pour le tableau de bord (id : durée d'écoute en ms)
const WATCH = { 0x132: 120, 0x292: 250, 0x352: 400, 0x3d2: 600, 0x118: 120, 0x257: 120, 0x33a: 600, 0x266: 120, 0x2e5: 120, 0x312: 400, 0x321: 600, 0x3f3: 900, 0x401: 900, 0x405: 900 };

const GEARS = { DI_GEAR_P: "P", DI_GEAR_R: "R", DI_GEAR_N: "N", DI_GEAR_D: "D", DI_GEAR_INVALID: "—", DI_GEAR_SNA: "—" };

class Tesla {
  constructor(elm) { this.elm = elm; this.dbc = teslaDbc(); this.last = new Map(); this.bricks = {}; this.vin = {}; }

  async init() {
    await this.elm.reset();
    await this.elm.at("ATSP6");
    this.elm.protocol = "6";
    this.elm.rawMode = true;
    const frames = await this.listen(0x132, 400);
    if (!frames.length) {
      const any = await this.elm.sniff(500).catch(() => []);
      if (!any.length) throw new Error("Aucune trame reçue. Vérifie le câble adaptateur Tesla (branché sur le connecteur de diagnostic du véhicule, pas sur une prise OBD standard) et que la voiture est réveillée (porte ouverte ou écran allumé).");
    }
    return { version: this.elm.version, protocol: "6", protocolName: "Bus véhicule Tesla (CAN 500 kbit/s, écoute)" };
  }

  async listen(id, ms) {
    await this.elm.at("ATCRA" + id.toString(16).toUpperCase().padStart(3, "0"));
    const frames = await this.elm.sniff(ms).catch(() => []);
    for (const f of frames) this.ingest(f);
    return frames;
  }

  ingest(f) {
    const id = parseInt(f.id, 16);
    const msg = this.dbc.get(id);
    if (!msg) return;
    const d = decodeMsg(msg, f.data);
    if (id === 0x401 && d.mux !== null) {
      for (const [k, v] of Object.entries(d.signals)) if (/^Brick\d+$/.test(k) && v.value > 2 && v.value < 4.6) this.bricks[k] = v.value;
    } else if (id === 0x405 && d.mux !== null) {
      this.vin[d.mux] = String.fromCharCode(...f.data.slice(1, 8).filter((b) => b >= 0x30 && b <= 0x5a));
    } else this.last.set(id, { at: Date.now(), name: msg.name, signals: d.signals });
  }

  sig(id, name) { const m = this.last.get(id); return m && m.signals[name] ? m.signals[name] : null; }
  val(id, name) { const s = this.sig(id, name); return s ? s.value : null; }

  async readVin() {
    for (let i = 0; i < 3 && Object.keys(this.vin).length < 3; i++) await this.listen(0x405, 900);
    const v = (this.vin[16] || "") + (this.vin[18] || "") + (this.vin[17] || "");
    const m = v.match(/[A-HJ-NPR-Z0-9]{17}/);
    return m ? m[0] : null;
  }

  // Lecture de toutes les trames du tableau de bord
  async poll(ids = Object.keys(WATCH).map(Number)) {
    for (const id of ids) await this.listen(id, WATCH[id] || 300);
    await this.elm.at("ATCRA");
    return this.summary();
  }

  summary() {
    const V = (id, n) => this.val(id, n);
    const volt = V(0x132, "BattVoltage132"), amp = V(0x132, "SmoothBattCurrent132");
    const full = V(0x352, "BMS_nominalFullPackEnergy"), rem = V(0x352, "BMS_nominalEnergyRemaining"), bol = V(0x292, "BattBeginningOfLifeEnergy292");
    const bricks = Object.values(this.bricks);
    const gear = this.sig(0x118, "DI_gear");
    return {
      soc: V(0x292, "SOCUI292") ?? V(0x33a, "UI_SOC"), socAvg: V(0x292, "SOCave292"), socMin: V(0x292, "SOCmin292"), socMax: V(0x292, "SOCmax292"),
      voltage: volt, current: amp, power: volt !== null && amp !== null ? (volt * amp) / 1000 : null,
      fullPack: full, remaining: rem, bol, health: full && bol ? (full / bol) * 100 : null,
      buffer: V(0x352, "BMS_energyBuffer"), toFull: V(0x352, "BMS_energyToChargeComplete"),
      charged: V(0x3d2, "TotalChargeKWh3D2"), discharged: V(0x3d2, "TotalDischargeKWh3D2"),
      speed: V(0x257, "DI_vehicleSpeed"), gear: gear ? GEARS[gear.text] || gear.text || gear.value : null,
      rearPower: V(0x266, "RearPower266"), frontPower: V(0x2e5, "FrontPower2E5"),
      packTempMin: V(0x312, "BMSminPackTemperature"), packTempMax: V(0x312, "BMSmaxPackTemperature"),
      ambient: V(0x321, "VCFRONT_tempAmbient"), coolantBatt: V(0x321, "VCFRONT_tempCoolantBatInlet"),
      odometer: V(0x3f3, "UI_odometer"), rangeMi: V(0x33a, "UI_Range"),
      cells: bricks.length ? { count: bricks.length, min: Math.min(...bricks), max: Math.max(...bricks), delta: (Math.max(...bricks) - Math.min(...bricks)) * 1000 } : null,
    };
  }

  // Toutes les trames reçues et décodées (pour « tout voir »)
  all() {
    return [...this.last.entries()].sort(([a], [b]) => a - b).map(([id, m]) => ({ id: id.toString(16).toUpperCase().padStart(3, "0"), name: m.name, age: Date.now() - m.at,
      signals: Object.entries(m.signals).map(([k, s]) => ({ name: k, value: s.value, unit: s.unit, text: s.text })) }));
  }

  // Écoute de tout le bus (sans filtre) pendant « ms » puis décodage
  async sniffAll(ms) {
    await this.elm.at("ATCRA");
    const frames = await this.elm.sniff(ms).catch(() => []);
    for (const f of frames) this.ingest(f);
    return frames;
  }
}

module.exports = { Tesla, teslaDbc, WATCH };
