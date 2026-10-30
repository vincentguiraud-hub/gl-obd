// Simulateur ELM327 branché sur un camion MAN TGX 2019 (J1939 250 kbit/s + UDS 29 bits).
"use strict";
const { EventEmitter } = require("events");
const { FakeEcu, IsoTpRx } = require("./fakeecu.cjs");
const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const dtc = (spn, fmi, oc) => [spn & 0xff, (spn >> 8) & 0xff, (((spn >> 16) & 7) << 5) | fmi, oc];

class SimTruckTransport extends EventEmitter {
  constructor() {
    super();
    this.t0 = Date.now();
    this.dm1 = { 0x00: [dtc(3251, 0, 3), dtc(1761, 18, 1)], 0x3d: [dtc(4364, 18, 2)] };
    this.dm2 = { 0x00: [dtc(100, 1, 2)] };
    const E = (o) => new FakeEcu(o);
    this.uds = {
      0x00: E({ ids: { F197: "EDC17CV52", F187: "51.25803-7650", F195: "P1236 V2.4", F193: "0281020123", F190: "WMA06XZZ9KP012345", F18C: "BOS12345678" },
        coding: [0x12, 0x00, 0x34, 0x01, 0x80, 0x00, 0x00, 0x05], dids: { "0100": [0x48, 0x00], "0101": [0x01, 0x90], "0102": [0x00, 0x2a] },
        dtcs: [[0xb3, 0x0c, 0x00, 0x09], [0xe1, 0x06, 0x12, 0x08]], routines: { "0201": { 1: [0x00], 3: [0x01] } } }),
      0x0b: E({ ids: { F197: "EBS3 Motorwagen", F187: "81.25808-7012", F195: "S12" }, dtcs: [[0x89, 0x03, 0x05, 0x08]] }),
      0x17: E({ ids: { F197: "Kombiinstrument", F187: "81.27205-6420", F195: "V07" }, dtcs: [] }),
      0x3d: E({ ids: { F197: "ACM 2.1", F187: "51.25450-7005", F195: "A21" }, dtcs: [[0x0c, 0x11, 0x12, 0x09]] }),
      0x21: E({ ids: { F197: "ZBR2", F187: "81.25806-7140", F195: "Z42" }, dtcs: [] }),
    };
    for (const e of Object.values(this.uds)) { const h = e.handle.bind(e); e.handle = (b) => (b[0] === 0x19 && b[1] === 0x01 ? [[0x59, 0x01, 0xff, 0x02, 0x00, e.dtcs.length]] : h(b)); }
    this.rx = new IsoTpRx();
    this.reset();
  }
  reset() { this.s = { echo: true, h: false, proto: "0", cp: 0x18, sh: 0xeafff9, cra: null, caf: true, r: true }; this.stopMon(); }
  async open() {}
  close() { this.stopMon(); this.emit("close"); }
  out(s) { setTimeout(() => this.emit("data", Buffer.from(s, "latin1")), 6); }
  stopMon() { if (this.mon) { clearInterval(this.mon); this.mon = null; return true; } return false; }

  write(str) {
    if (this.stopMon()) { this.out("\r\r>"); return; }
    const cmd = str.replace(/\r$/, "").trim().toUpperCase().replace(/\s+/g, "");
    const echo = this.s.echo ? cmd + "\r" : "";
    if (/^AT(MA|DM1|MP)/.test(cmd)) return this.monitor(cmd.slice(2), echo);
    this.out(echo + this.handle(cmd) + "\r\r>");
  }

  busUp() { return ["A", "9"].includes(this.s.proto); }
  fr(id, data) {
    const d = [...data]; while (d.length < 8) d.push(0xff);
    const idh = id.toString(16).toUpperCase().padStart(8, "0").match(/../g).join(" ");
    return `${this.s.h ? idh + " " : ""}${d.map(h2).join(" ")}`;
  }
  // message J1939 complet (diffusion BAM si > 8 octets)
  j(pgn, sa, data, prio = 6) {
    const pf = (pgn >> 8) & 0xff, ps = pgn & 0xff;
    if (data.length <= 8) return [this.fr((prio << 26) | (pf << 16) | ((pf >= 0xf0 ? ps : 0xff) << 8) | sa, data)];
    const n = Math.ceil(data.length / 7);
    const out = [this.fr((7 << 26) | (0xec << 16) | (0xff << 8) | sa, [0x20, data.length & 0xff, data.length >> 8, n, 0xff, pgn & 0xff, (pgn >> 8) & 0xff, pgn >> 16])];
    for (let i = 0; i < n; i++) out.push(this.fr((7 << 26) | (0xeb << 16) | (0xff << 8) | sa, [i + 1, ...data.slice(i * 7, i * 7 + 7)]));
    return out;
  }
  dmMsg(pgn, list) {
    const out = [];
    for (const [sa, d] of Object.entries(list)) if (d.length) out.push(...this.j(pgn, +sa, [0x04, 0xff, ...d.flat()]));
    return out;
  }
  live(pgn) {
    const t = (Date.now() - this.t0) / 1000, rpm = 600 + Math.max(0, Math.sin(t / 4)) * 900, sp = Math.max(0, Math.sin(t / 4)) * 80;
    const w = (v) => [Math.round(v) & 0xff, (Math.round(v) >> 8) & 0xff];
    const w4 = (v) => { v = Math.round(v); return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]; };
    const m = {
      0xf004: [0xf1, 0x7d, 125 + Math.round(sp / 2), ...w(rpm / 0.125), 0x00, 0xff, 0xff],
      0xf003: [0xff, Math.round(sp * 1.1 / 0.4), Math.round(20 + sp / 2), 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfef1: [0xff, ...w(sp * 256), 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfeee: [Math.round(Math.min(85, 30 + t)) + 40, 0xff, ...w((Math.min(95, 28 + t) + 273) / 0.03125), 0xff, 0xff, 0xff, 0xff],
      0xfeef: [0xff, 0xff, 0xff, Math.round((2 + rpm / 1000) * 25), 0xff, 0xff, 0xff, 0xff],
      0xfef6: [0xff, Math.round((0.2 + sp / 60) * 50), 34 + 40, 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfef7: [0xff, 0xff, 0xff, 0xff, ...w(27.6 / 0.05), 0xff, 0xff],
      0xfefc: [0xff, Math.round(71 / 0.4), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfef2: [...w((3 + sp / 3) / 0.05), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfe56: [Math.round(8 / 0.4), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfef5: [0xff, 0xff, 0xff, ...w((12 + 273) / 0.03125), 0xff, 0xff, 0xff],
      0xfee5: [...w4(18432.5 / 0.05), 0xff, 0xff, 0xff, 0xff],
      0xfee0: [0xff, 0xff, 0xff, 0xff, ...w4(612480 / 0.125)],
      0xfeae: [0xff, 0xff, Math.round(1050 / 8), 0xff, 0xff, 0xff, 0xff, 0xff],
      0xfd7b: [64, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    };
    return m[pgn];
  }

  monitor(arg, echo) {
    if (!this.busUp()) { this.out(echo + "\r\r>"); return; }
    this.out(echo);
    let pgn = null, dm1 = false;
    if (arg === "DM1") dm1 = true;
    else if (arg.startsWith("MP")) pgn = parseInt(arg.slice(2, 6), 16);
    let tick = 0;
    this.mon = setInterval(() => {
      tick++;
      const lines = [];
      if (dm1 || (!pgn && tick % 5 === 0)) { if (tick % 5 === 0 || tick === 1) lines.push(...this.dmMsg(0xfeca, this.dm1)); }
      if (!dm1 && !pgn) lines.push(...this.j(0xf004, 0, this.live(0xf004), 3));
      if (pgn && this.live(pgn) && (pgn < 0xfe00 || tick % 4 === 1)) lines.push(...this.j(pgn, 0, this.live(pgn)));
      if (lines.length) this.emit("data", Buffer.from(lines.join("\r") + "\r", "latin1"));
    }, 50);
  }

  handle(c) {
    const s = this.s;
    if (c === "") return "";
    if (c.startsWith("AT")) {
      const a = c.slice(2);
      if (a === "Z") { this.reset(); return "\r\rELM327 v2.1"; }
      if (a === "RV") return "27.4V";
      if (a === "DPN") return s.proto;
      if (/^E[01]$/.test(a)) { s.echo = a[1] === "1"; return "OK"; }
      if (/^H[01]$/.test(a)) { s.h = a[1] === "1"; return "OK"; }
      if (a.startsWith("SP")) { s.proto = a.slice(2); return "OK"; }
      if (a.startsWith("CP")) { s.cp = parseInt(a.slice(2), 16); return "OK"; }
      if (a.startsWith("SH")) { s.sh = parseInt(a.slice(2), 16); return "OK"; }
      if (a.startsWith("CRA")) { s.cra = a.length > 3 ? parseInt(a.slice(3), 16) : null; return "OK"; }
      if (/^CAF[01]$/.test(a)) { s.caf = a[3] === "1"; return "OK"; }
      if (/^R[01]$/.test(a)) { s.r = a[1] === "1"; return "OK"; }
      return "OK";
    }
    if (!/^[0-9A-F]+$/.test(c) || c.length % 2) return "?";
    if (!this.busUp()) return "CAN ERROR";
    let b = c.match(/../g).map((x) => parseInt(x, 16));
    if (s.proto === "A") {
      const pgn = b[0] | (b[1] << 8) | (b[2] << 16);
      if (pgn === 0xfecb) return this.dmMsg(0xfecb, this.dm2).join("\r") || "NO DATA";
      if (pgn === 0xfed3) { this.dm1 = { 0x00: [], 0x3d: [] }; this.dm2 = {}; return this.fr(0x18e8ff00, [0, 0xff, 0xff, 0xff, 0xff, 0xd3, 0xfe, 0]); }
      if (pgn === 0xfecc) { this.dm2 = {}; return this.fr(0x18e8ff00, [0, 0xff, 0xff, 0xff, 0xff, 0xcc, 0xfe, 0]); }
      if (pgn === 0xfeec) return this.j(0xfeec, 0, [...Buffer.from("WMA06XZZ9KP012345*", "latin1")]).join("\r");
      if (pgn === 0xf004) return "NO DATA"; // non demandable : il faut écouter
      const d = this.live(pgn);
      return d ? this.j(pgn, 0, d).join("\r") : "NO DATA";
    }
    // UDS 29 bits : 18 DA <cible> F1
    const target = (s.sh >> 8) & 0xff;
    const m = this.uds[target];
    const resp = 0x18daf100 | target;
    if (!m || (s.cra !== null && s.cra !== resp)) return s.r ? "NO DATA" : "";
    if (!s.caf) {
      const r = this.rx.push(b);
      if (r.fc) return s.r ? this.fr(resp, [0x30, 0, 0]) : "";
      if (!r.done) return s.r ? "NO DATA" : "";
      b = r.done;
    }
    const lines = m.handle(b).flatMap((p) => this.isotp(resp, p));
    return s.r ? lines.join("\r") : "";
  }

  isotp(id, p) {
    if (p.length <= 7) return [this.fr(id, [p.length, ...p])];
    const out = [this.fr(id, [0x10 | (p.length >> 8), p.length & 0xff, ...p.slice(0, 6)])];
    for (let i = 6, sn = 1; i < p.length; i += 7, sn = (sn + 1) & 15) out.push(this.fr(id, [0x20 | sn, ...p.slice(i, i + 7)]));
    return out;
  }
}
module.exports = { SimTruckTransport };
