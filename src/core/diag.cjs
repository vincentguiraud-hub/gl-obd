// Service de diagnostic : regroupe connexion, OBD générique et calculateurs VW.
"use strict";
const { EventEmitter } = require("events");
const { Elm, PROTOCOLS } = require("./elm.cjs");
const { Obd, PIDS, decodeVin } = require("./obd.cjs");
const { Vag } = require("./vag.cjs");
const { TcpTransport, SerialTransport, BridgeTransport } = require("./transports.cjs");
const { SimTransport } = require("./sim.cjs");
const { SimTruckTransport } = require("./simtruck.cjs");
const { Hd, TRUCK_MODULES } = require("./hd.cjs");
const { Uds } = require("./uds.cjs");
const { Tesla } = require("./tesla.cjs");
const { SimTeslaTransport } = require("./simtesla.cjs");

class Diag extends EventEmitter {
  constructor() {
    super();
    this.mileageDids = new Set(); // « adresse:numéro » des valeurs reconnues comme kilométrage
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
    // Câble USB / port COM : si la vitesse choisie ne répond pas, on essaie les autres
    if (opts.type === "serial" && !opts.noAuto) {
      const rates = [Number(opts.baud) || 38400, 115200, 38400, 500000, 230400, 9600, 2000000].filter((v, i, a) => a.indexOf(v) === i);
      let last;
      for (const baud of rates) {
        try { return await this.connect({ ...opts, baud, noAuto: true }, bridgeSend); }
        catch (e) {
          last = e;
          if (!/Pas de réponse de l'adaptateur/.test(e.message)) throw e;
          this.emit("status", { state: "connecting", text: `Essai à ${baud} bauds sans réponse, autre vitesse…` });
        }
      }
      throw new Error("L'adaptateur ne répond à aucune vitesse. Vérifie qu'il est bien branché sur la prise OBD (voyant allumé) et que le bon port COM est choisi.");
    }
    await this.disconnect();
    let t;
    if (opts.type === "wifi") t = new TcpTransport(opts.host || "192.168.0.10", Number(opts.port) || 35000);
    else if (opts.type === "serial") t = new SerialTransport(opts.path, Number(opts.baud) || 38400);
    else if (opts.type === "ble") t = new BridgeTransport(bridgeSend);
    else t = opts.vehicle === "truck" ? new SimTruckTransport() : opts.vehicle === "tesla" ? new SimTeslaTransport() : new SimTransport();
    const truck = opts.vehicle === "truck";
    this.emit("status", { state: "connecting", text: "Connexion à l'adaptateur…" });
    await t.open();
    this.t = t;
    t.on("close", () => {
      if (this.t === t) { this.t = null; this.elm = null; this.emit("status", { state: "disconnected", text: "Adaptateur déconnecté" }); }
    });
    const elm = new Elm(t, (d, x) => this.log(d, x));
    try {
      this.emit("status", { state: "connecting", text: "Initialisation de l'ELM327…" });
      this.obd = new Obd(elm);
      this.vag = new Vag(elm);
      this.hd = new Hd(elm);
      this.uds = new Uds(elm, (m, quick) => (this.mode === "truck" ? this.hd.open(m.sa, quick) : this.vag.open(m, quick)));
      this.tesla = new Tesla(elm);
      this.mode = truck ? "truck" : opts.vehicle === "tesla" ? "tesla" : "car";
      const r = truck ? await this.hd.init() : this.mode === "tesla" ? await this.tesla.init() : await elm.init();
      this.elm = elm;
      this.emit("status", { state: "connecting", text: "Lecture du véhicule…" });
      this.info = this.mode === "tesla" ? await this.readTesla(r, opts.type === "demo" || !opts.type) : truck ? await this.readTruck(r, opts.type === "demo" || !opts.type) : await this.readVehicle(r, opts.type === "demo" || !opts.type);
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
    this.vag.generic = !dec.vag && !!dec.brand;
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

  async readTesla(r, demo) {
    let vin = null, voltage = null;
    try { vin = await this.tesla.readVin(); } catch {}
    try { voltage = await this.elm.voltage(); } catch {}
    const dec = decodeVin(vin);
    return { demo, tesla: true, adapter: r.version, protocol: r.protocol, protocolName: r.protocolName, isCan: true, vin, voltage, ecus: {},
      brand: "Tesla", model: vin && vin[3] === "Y" ? "Model Y" : vin && vin[3] === "3" ? "Model 3" : null, year: dec.year, vag: false, vagCapable: false };
  }
  teslaPoll() { return this.run(async () => { this.need(); this.needTesla(); return this.tesla.poll(); }); }
  teslaAll(ms = 1500) { return this.run(async () => { this.need(); this.needTesla(); await this.tesla.sniffAll(ms); return this.tesla.all(); }); }
  needTesla() { if (this.mode !== "tesla") throw new Error("Fonction réservée aux Tesla."); }

  async readTruck(r, demo) {
    let vin = null, voltage = null;
    try { vin = await this.hd.vin(); } catch {}
    try { voltage = await this.elm.voltage(); } catch {}
    const dec = decodeVin(vin);
    return {
      demo, truck: true, adapter: r.version, protocol: r.protocol, protocolName: r.protocolName, isCan: true,
      vin, voltage, ecus: {}, brand: dec.brand || "Poids lourd", year: dec.year, vag: false, vagCapable: true,
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

  voltage() { return this.run(async () => { this.need(); return this.elm.voltage(); }); }
  get truck() { return this.mode === "truck"; }
  noTesla() { if (this.mode === "tesla") throw new Error("Tesla ne donne pas accès à ses défauts et calculateurs avec un outil du commerce : utilise la page « Tesla » (lecture du bus) ou l'écran de la voiture (menu Service)."); }
  readDtcs() { return this.run(async () => { this.need(); this.noTesla(); await this.leaveVag(); return this.truck ? this.hd.readDtcs() : this.obd.readAllDtcs(); }); }
  clearDtcs() { return this.run(async () => { this.need(); this.noTesla(); await this.leaveVag(); return this.truck ? this.hd.clearDtcs() : this.obd.clearDtcs(); }); }
  readiness() { return this.run(async () => { this.need(); this.noTesla(); if (this.truck) throw new Error("Non disponible sur poids lourd."); await this.leaveVag(); return this.obd.readiness(); }); }
  freezeFrame() { return this.run(async () => { this.need(); this.noTesla(); if (this.truck) throw new Error("Non disponible sur poids lourd."); await this.leaveVag(); return this.obd.freezeFrame(); }); }

  supportedPids() {
    return this.run(async () => {
      this.need(); this.noTesla(); await this.leaveVag();
      if (this.truck) return this.hd.params();
      const list = await this.obd.supportedPids();
      return list.filter((p) => PIDS[p] && !PIDS[p].hidden).map((p) => ({ pid: p, name: PIDS[p].name, unit: PIDS[p].unit, min: PIDS[p].min ?? 0, max: PIDS[p].max ?? null, dec: PIDS[p].dec ?? (["°C", "%", "kPa"].includes(PIDS[p].unit) ? 0 : 1) }));
    });
  }
  // Liste brute des PID gérés par le moteur (y compris ceux réservés à l'onglet Performance)
  supportedRaw() { return this.run(async () => { this.need(); this.noTesla(); await this.leaveVag(); if (this.truck) return []; return this.obd.supportedPids(); }); }
  readPids(pids) { return this.run(async () => { this.need(); await this.leaveVag(); return this.truck ? this.hd.readParams(pids) : this.obd.readPids(pids); }); }

  async leaveVag() { if (this.inVag && !this.truck) { await this.vag.done(); this.inVag = false; } }

  vagModules() {
    if (this.truck) return TRUCK_MODULES;
    return this.vag ? this.vag.modules() : new Vag(null).modules();
  }
  vagScanModule(m) { return this.run(async () => { this.need(); this.inVag = true; return this.truck ? this.hd.scanModule(m) : this.vag.scanModule(m); }); }
  vagClear(m) {
    return this.run(async () => {
      this.need(); this.inVag = true;
      if (this.truck) return this.hd.clearModule(m);
      try { return await this.vag.clearDtcs(m); }
      catch (e) {
        // Calculateur moteur qui refuse l'effacement constructeur : effacement OBD standard (mode 04)
        if (m.req !== 0x7e0 && m.req !== 0x7e1) throw e;
        await this.vag.done(); this.inVag = false;
        await this.obd.clearDtcs();
        return true;
      }
    });
  }
  vagDiscover(onProgress) {
    return this.run(async () => {
      this.need(); this.inVag = true;
      if (this.truck) return this.hd.discover(onProgress);
      return this.vag.discover(onProgress);
    });
  }

  // Atelier calculateur : toutes les opérations UDS avancées
  atelier(op, m, ...args) {
    const ops = ["identification", "dtcDetails", "allDtcs", "readCoding", "session", "login", "writeDid", "scanDids", "readMany", "routine", "reset", "raw", "did"];
    if (!ops.includes(op)) throw new Error("Opération inconnue");
    return this.run(async () => {
      this.need(); this.noTesla(); this.inVag = true;
      if (op === "did") { const b = await this.uds.did(m, args[0]); return b ? require("./uds.cjs").interpret(b) : null; }
      if (op === "readCoding") return this.uds.readCoding(m);
      if (op === "writeDid" && this.mileageDids.has(`${m.req}:${String(args[0]).toUpperCase()}`))
        throw new Error("Cette valeur est le kilométrage du véhicule : sa modification est interdite (fraude au compteur). G&L Diag permet seulement de le vérifier.");
      return this.uds[op](m, ...args);
    });
  }
  cancelScan() { this.scanCancelled = true; }

  // Vérification du kilométrage : compare le compteur avec les valeurs trouvées dans chaque calculateur
  // known : { "<référence pièce>": ["DID", ...] } valeurs déjà reconnues lors d'une recherche précédente
  checkMileage(modules, ref, ranges, known = {}, onProgress = () => {}) {
    this.scanCancelled = false;
    return this.run(async () => {
      this.need(); this.noTesla(); this.inVag = true;
      const res = { obd: null, modules: [] };
      if (!this.truck) { await this.leaveVag(); try { const v = await this.obd.readPids([0xa6]); res.obd = v[0xa6] ?? null; } catch {} this.inVag = true; }
      const { Uds } = require("./uds.cjs");
      for (let i = 0; i < modules.length; i++) {
        if (this.scanCancelled) break;
        const m = modules[i];
        const r = { addr: m.addr, name: m.name, part: m.partNumber || null, matches: [], scanned: 0, knownValues: [] };
        // 1. valeurs déjà connues pour cette référence de calculateur : lecture directe
        for (const k of known[r.part] || []) {
          this.mileageDids.add(`${m.req}:${k.did}`);
          try {
            const b = await this.uds.did(m, k.did, true);
            if (!b) continue;
            const v = require("./uds.cjs").interpret(b), raw = v.u32 ?? v.u24 ?? v.u16;
            if (raw !== undefined) r.knownValues.push({ did: k.did, raw: v.hex, km: Math.round(raw * k.scale), diff: Math.round(raw * k.scale - ref) });
          } catch {}
        }
        // 2. recherche dans les zones demandées
        for (const [from, to] of ranges) {
          if (this.scanCancelled) break;
          const found = await this.uds.scanDids(m, from, to, (p, did, n) => onProgress((i + (ranges.findIndex((x) => x[0] === from) + p) / ranges.length) / modules.length, `${m.addr} ${m.name} · ${did}`), () => this.scanCancelled);
          r.scanned += found.length;
          r.matches.push(...Uds.mileageMatches(found, ref));
        }
        for (const x of r.matches) this.mileageDids.add(`${m.req}:${x.did}`);
        res.modules.push(r);
      }
      onProgress(1, "");
      return res;
    });
  }
  scanDids(m, from, to, onProgress) {
    this.scanCancelled = false;
    return this.run(async () => { this.need(); this.inVag = true; return this.uds.scanDids(m, from, to, onProgress, () => this.scanCancelled); });
  }

  mode06() { return this.run(async () => { this.need(); this.noTesla(); await this.leaveVag(); return this.obd.mode06(); }); }
  mode09() { return this.run(async () => { this.need(); this.noTesla(); await this.leaveVag(); return this.obd.mode09(); }); }

  // Espion du bus CAN : écoute pendant « ms »
  sniff(ms = 1000) {
    return this.run(async () => {
      this.need();
      if (this.mode === "tesla") { await this.elm.at("ATCRA"); return this.elm.sniff(ms); }
      if (this.inVag && !this.truck) { await this.vag.done(); this.inVag = false; }
      if (this.truck) { await this.hd.j1939(); try { await this.elm.at("ATCRA"); } catch {} }
      return this.elm.sniff(ms);
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
