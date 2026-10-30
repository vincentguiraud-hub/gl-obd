// Service de diagnostic : regroupe connexion, OBD générique et calculateurs VW.
"use strict";
const { EventEmitter } = require("events");
const { Elm, PROTOCOLS } = require("./elm.cjs");
const { Obd, PIDS, decodeVin } = require("./obd.cjs");
const { Vag } = require("./vag.cjs");
const { TcpTransport, SerialTransport, BridgeTransport } = require("./transports.cjs");
const { SimTransport } = require("./sim.cjs");

class Diag extends EventEmitter {
  constructor() {
    super();
    this.t = null;
    this.elm = null;
    this.info = null;
    this.busy = Promise.resolve();
  }

  log(dir, text) { this.emit("log", { dir, text, at: Date.now() }); }

  // Toutes les opérations passent l'une après l'autre (un seul adaptateur)
  run(fn) {
    const p = this.busy.then(fn, fn);
    this.busy = p.catch(() => {});
    return p;
  }

  get connected() { return !!this.elm; }

  async connect(opts, bridgeSend) {
    await this.disconnect();
    let t;
    if (opts.type === "wifi") t = new TcpTransport(opts.host || "192.168.0.10", Number(opts.port) || 35000);
    else if (opts.type === "serial") t = new SerialTransport(opts.path, Number(opts.baud) || 38400);
    else if (opts.type === "ble") t = new BridgeTransport(bridgeSend);
    else t = new SimTransport();
    this.emit("status", { state: "connecting", text: "Connexion à l'adaptateur…" });
    await t.open();
    this.t = t;
    t.on("close", () => {
      if (this.t === t) { this.t = null; this.elm = null; this.emit("status", { state: "disconnected", text: "Adaptateur déconnecté" }); }
    });
    const elm = new Elm(t, (d, x) => this.log(d, x));
    try {
      this.emit("status", { state: "connecting", text: "Initialisation de l'ELM327…" });
      const r = await elm.init();
      this.elm = elm;
      this.obd = new Obd(elm);
      this.vag = new Vag(elm);
      this.emit("status", { state: "connecting", text: "Lecture du véhicule…" });
      this.info = await this.readVehicle(r, opts.type === "demo" || !opts.type);
      this.emit("status", { state: "connected", text: "Connecté", info: this.info });
      return this.info;
    } catch (e) {
      try { t.close(); } catch {}
      this.t = null; this.elm = null;
      this.emit("status", { state: "disconnected", text: e.message });
      throw e;
    }
  }

  async readVehicle(r, demo) {
    let vin = null, voltage = null, ecus = {};
    try { vin = await this.obd.vin(); } catch {}
    try { voltage = await this.elm.voltage(); } catch {}
    try { ecus = await this.obd.ecuNames(); } catch {}
    const dec = decodeVin(vin);
    return {
      demo,
      adapter: r.version,
      protocol: r.protocol,
      protocolName: r.protocolName,
      isCan: this.elm.isCan,
      vin, voltage, ecus,
      brand: dec.brand, year: dec.year, vag: dec.vag,
      // les calculateurs VW nécessitent du CAN 11 bits (VW ≈ 2008+)
      vagCapable: this.elm.isCan,
    };
  }

  async disconnect() {
    if (this.t) {
      const t = this.t;
      this.t = null; this.elm = null;
      try { t.close(); } catch {}
      this.emit("status", { state: "disconnected", text: "Déconnecté" });
    }
  }

  need() { if (!this.elm) throw new Error("Pas connecté à l'adaptateur. Va dans « Connexion » d'abord."); }

  voltage() { return this.run(async () => { this.need(); await this.leaveVag(); return this.elm.voltage(); }); }
  readDtcs() { return this.run(async () => { this.need(); await this.leaveVag(); return this.obd.readAllDtcs(); }); }
  clearDtcs() { return this.run(async () => { this.need(); await this.leaveVag(); return this.obd.clearDtcs(); }); }
  readiness() { return this.run(async () => { this.need(); await this.leaveVag(); return this.obd.readiness(); }); }
  freezeFrame() { return this.run(async () => { this.need(); await this.leaveVag(); return this.obd.freezeFrame(); }); }

  supportedPids() {
    return this.run(async () => {
      this.need(); await this.leaveVag();
      const list = await this.obd.supportedPids();
      return list.filter((p) => PIDS[p]).map((p) => ({ pid: p, name: PIDS[p].name, unit: PIDS[p].unit, min: PIDS[p].min ?? 0, max: PIDS[p].max ?? null, dec: PIDS[p].dec ?? (["°C", "%", "kPa"].includes(PIDS[p].unit) ? 0 : 1) }));
    });
  }
  readPids(pids) { return this.run(async () => { this.need(); await this.leaveVag(); return this.obd.readPids(pids); }); }

  async leaveVag() { if (this.inVag) { await this.vag.done(); this.inVag = false; } }

  vagModules() { return this.vag ? this.vag.modules() : new Vag(null).modules(); }
  vagScanModule(m) { return this.run(async () => { this.need(); this.inVag = true; return this.vag.scanModule(m); }); }
  vagClear(m) { return this.run(async () => { this.need(); this.inVag = true; return this.vag.clearDtcs(m); }); }
  vagDiscover(onProgress) {
    return this.run(async () => {
      this.need(); this.inVag = true;
      const list = await this.vag.discover(onProgress);
      // moteur et boîte sont hors de la plage balayée
      for (const m of this.vag.modules().filter((x) => x.req >= 0x7e0)) {
        const id = await this.vag.identify(m);
        if (id) list.unshift({ ...m, name: m.name });
      }
      return list;
    });
  }

  raw(cmd) {
    return this.run(async () => {
      this.need();
      const r = await this.elm.send(cmd.trim(), 10000);
      if (/^AT\s*(SH|CRA|FC|SP|ST|AT|H|S|E|Z|D|WS)/i.test(cmd.trim())) this.elm.state = {};
      // ces commandes remettent l'adaptateur à zéro : on refait la configuration
      if (/^AT\s*(Z|D|WS|E1|H0|S0|L1)\s*$/i.test(cmd.trim())) { try { await this.elm.init(); } catch {} }
      return r.replace(/\r+/g, "\n").trim();
    });
  }
}

module.exports = { Diag, PROTOCOLS };
