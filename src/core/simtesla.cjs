// Simulateur : adaptateur ELM327 branché (via câble) sur le bus véhicule d'une Tesla Model Y.
"use strict";
const { EventEmitter } = require("events");
const { encodeMsg } = require("./dbc.cjs");
const { teslaDbc } = require("./tesla.cjs");
const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const VIN = "LRWYGCEK1RC012345";

class SimTeslaTransport extends EventEmitter {
  constructor() { super(); this.dbc = teslaDbc(); this.t0 = Date.now(); this.reset(); this.n = 0; }
  reset() { this.s = { echo: true, cra: null }; this.stop(); }
  stop() { if (this.mon) { clearInterval(this.mon); this.mon = null; return true; } return false; }
  async open() {}
  close() { this.stop(); this.emit("close"); }
  out(s) { setTimeout(() => this.emit("data", Buffer.from(s, "latin1")), 5); }
  write(str) {
    if (this.stop()) return this.out("\r\r>");
    const c = str.replace(/\r$/, "").trim().toUpperCase().replace(/\s+/g, "");
    const echo = this.s.echo ? c + "\r" : "";
    if (c === "ATMA") { this.out(echo); this.mon = setInterval(() => this.tick(), 10); return; }
    let r = "OK";
    if (c === "ATZ") { this.reset(); r = "\r\rELM327 v2.2"; }
    else if (c === "ATRV") r = "13.4V";
    else if (/^ATE[01]$/.test(c)) this.s.echo = c[3] === "1";
    else if (c.startsWith("ATCRA")) this.s.cra = c.length > 5 ? parseInt(c.slice(5), 16) : null;
    else if (!c.startsWith("AT")) r = "NO DATA";
    this.out(echo + r + "\r\r>");
  }
  values() {
    const t = (Date.now() - this.t0) / 1000, drive = Math.max(0, Math.sin(t / 5));
    const amp = drive * 180 - 3;
    return {
      BattVoltage132: 392 - drive * 12, SmoothBattCurrent132: amp, RawBattCurrent132: amp,
      SOCUI292: 78.4, SOCave292: 79.1, SOCmin292: 78.6, SOCmax292: 79.6, BattBeginningOfLifeEnergy292: 78.8,
      BMS_nominalFullPackEnergy: 74.6, BMS_nominalEnergyRemaining: 58.9, BMS_energyBuffer: 3.4, BMS_energyToChargeComplete: 15.2, BMS_expectedEnergyRemaining: 57.1, BMS_idealEnergyRemaining: 58.9,
      TotalChargeKWh3D2: 6123.456, TotalDischargeKWh3D2: 5890.112,
      DI_vehicleSpeed: drive * 90, DI_gear: drive > 0.02 ? 4 : 1, DI_systemState: 2, DI_accelPedalPos: drive * 40,
      UI_SOC: 78, UI_Range: 241, UI_idealRange: 255, UI_ratedWHpM: 239,
      RearPower266: amp * 0.37, FrontPower2E5: amp * 0.08,
      BMSminPackTemperature: 21.5, BMSmaxPackTemperature: 24.25,
      VCFRONT_tempAmbient: 14.5, VCFRONT_tempCoolantBatInlet: 22.0, UI_odometer: 18342.7,
    };
  }
  tick() {
    this.n++;
    const v = this.values(), L = [];
    const add = (id, data) => { if (this.s.cra === null || this.s.cra === id) L.push(`${id.toString(16).toUpperCase().padStart(3, "0")} ${data.map(h2).join(" ")}`); };
    for (const id of [0x132, 0x118, 0x257, 0x266, 0x2e5]) add(id, encodeMsg(this.dbc.get(id), v));
    if (this.n % 5 === 0) for (const id of [0x292, 0x312, 0x352]) add(id, encodeMsg(this.dbc.get(id), v));
    if (this.n % 10 === 0) for (const id of [0x3d2, 0x33a, 0x321, 0x3f3]) add(id, encodeMsg(this.dbc.get(id), v));
    if (this.n % 2 === 0) {
      const mux = (this.n / 2) % 32, bricks = {};
      for (let k = 0; k < 3; k++) bricks["Brick" + (mux * 3 + k)] = 3.912 + ((mux * 3 + k) % 7) * 0.0021;
      add(0x401, encodeMsg(this.dbc.get(0x401), bricks, mux));
    }
    if (this.n % 6 === 0) {
      const part = [16, 17, 18][(this.n / 6) % 3];
      const txt = part === 16 ? "\0\0\0\0" + VIN.slice(0, 3) : part === 18 ? VIN.slice(3, 10) : VIN.slice(10, 17);
      add(0x405, [part, ...Buffer.from(txt, "latin1")]);
    }
    if (L.length) this.emit("data", Buffer.from(L.join("\r") + "\r", "latin1"));
  }
}
module.exports = { SimTeslaTransport };
