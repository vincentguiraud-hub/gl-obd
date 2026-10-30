// Simulateur d'adaptateur ELM327 branché sur un VW Crafter 2019 2.0 TDI.
// Sert au « mode démo » (essayer l'appli sans voiture) et aux tests.
"use strict";
const { EventEmitter } = require("events");

const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const VIN = "WV1ZZZSYZK9012345";

const MODULES = {
  0x7e0: { resp: 0x7e8, ids: { F197: "R4 2.0l TDI", F187: "04L907309R", F189: "0003", F191: "04L907309R", F1A3: "H17" },
    dtcs: [[0x02, 0x99, 0x00, 0x09], [0x24, 0x63, 0x00, 0x08], [0x20, 0xee, 0x00, 0x04]], pending78: true },
  0x713: { resp: 0x77d, ids: { F197: "ESC", F187: "2N0907379H", F189: "0280", F191: "2N0614517A", F1A3: "H09" }, dtcs: [[0x40, 0x35, 0x1c, 0x2c]] },
  0x715: { resp: 0x77f, ids: { F197: "Airbag VW8R", F187: "2N0959655B", F189: "0812", F1A3: "H05" }, dtcs: [] },
  0x714: { resp: 0x77e, ids: { F197: "KOMBI", F187: "7C0920740B", F189: "0211", F1A3: "H12" }, dtcs: [[0xc1, 0x21, 0x00, 0x09]] },
  0x710: { resp: 0x77a, ids: { F197: "Gateway MQB-B", F187: "2Q0907530AA", F189: "2228", F1A3: "H14" }, dtcs: [] },
  0x70e: { resp: 0x778, ids: { F197: "BCM MQB-B High", F187: "7C0937084", F189: "0105", F1A3: "H22" }, dtcs: [[0x90, 0x52, 0x13, 0x08]], needsExtended: true },
  0x712: { resp: 0x77c, ids: { F197: "EPS_ZFLS Kl.11", F187: "7C1909144A", F189: "2701", F1A3: "H04" }, dtcs: [] },
  0x746: { resp: 0x7b0, ids: { F197: "Climatronic", F187: "7C0907044", F189: "0302", F1A3: "H03" }, dtcs: [] },
  0x74f: { resp: 0x7b9, ids: { F197: "Frontkamera", F187: "3QD980654", F189: "0410", F1A3: "H06" }, dtcs: [] },
};

class SimTransport extends EventEmitter {
  constructor() {
    super();
    this.reset();
    this.t0 = Date.now();
    this.storedCleared = false;
  }
  reset() { this.s = { echo: true, h: false, sp: true, sh: 0x7df, cra: null, proto: "0", ext: false }; }
  async open() {}
  close() { this.emit("close"); }
  write(str) {
    const cmd = str.replace(/\r$/, "").trim();
    const out = this.handle(cmd.toUpperCase().replace(/\s+/g, ""));
    const echo = this.s.echo ? cmd + "\r" : "";
    setTimeout(() => this.emit("data", Buffer.from(echo + out + "\r\r>", "latin1")), 8);
  }

  handle(c) {
    if (c === "") return "";
    if (c.startsWith("AT")) return this.at(c.slice(2));
    if (!/^[0-9A-F]+$/.test(c) || c.length % 2) return "?";
    if (this.s.proto === "0") this.s.proto = "6";
    const bytes = c.match(/../g).map((x) => parseInt(x, 16));
    const lines = [];
    if (this.s.sh === 0x7df || this.s.sh === 0x7e0 && bytes[0] < 0x10) {
      const p = this.obd(bytes);
      if (p) lines.push(...this.frames(0x7e8, p));
    } else {
      const m = MODULES[this.s.sh];
      if (m && (this.s.cra === null || this.s.cra === m.resp)) {
        for (const p of this.uds(m, bytes)) lines.push(...this.frames(m.resp, p));
      }
    }
    return lines.length ? lines.join("\r") : "NO DATA";
  }

  at(a) {
    const s = this.s;
    if (a === "Z") { this.reset(); return "\r\rELM327 v1.5"; }
    if (a === "I") return "ELM327 v1.5";
    if (a === "@1") return "G&L DEMO OBDII";
    if (a === "RV") return (Date.now() - this.t0 > 3000 ? 14.1 : 12.6).toFixed(1) + "V";
    if (a === "DPN") return s.proto === "0" ? "A6" : s.proto;
    if (a === "DP") return "ISO 15765-4 (CAN 11/500)";
    if (a.startsWith("E")) { s.echo = a[1] === "1"; return "OK"; }
    if (a.startsWith("H")) { s.h = a[1] === "1"; return "OK"; }
    if (a.startsWith("S") && /^S[01]$/.test(a)) { s.sp = a[1] === "1"; return "OK"; }
    if (a.startsWith("SP")) { s.proto = a.slice(2) === "0" ? "0" : a.slice(2); return "OK"; }
    if (a.startsWith("SH")) { s.sh = parseInt(a.slice(2), 16); return "OK"; }
    if (a.startsWith("CRA")) { s.cra = a.length > 3 ? parseInt(a.slice(3), 16) : null; return "OK"; }
    return "OK";
  }

  frames(id, p) {
    const idh = id.toString(16).toUpperCase();
    const fmt = (arr) => {
      while (arr.length < 8) arr.push(0xaa);
      return this.s.h ? `${idh} ${arr.map(h2).join(" ")}` : arr.map(h2).join(" ");
    };
    if (p.length <= 7) return [fmt([p.length, ...p])];
    const out = [fmt([0x10 | (p.length >> 8), p.length & 0xff, ...p.slice(0, 6)])];
    let sn = 1;
    for (let i = 6; i < p.length; i += 7, sn = (sn + 1) & 0xf) out.push(fmt([0x20 | sn, ...p.slice(i, i + 7)]));
    return out;
  }

  live() {
    const t = (Date.now() - this.t0) / 1000;
    const running = t > 3;
    const rpm = running ? 820 + Math.max(0, Math.sin(t / 3) * 1400) + Math.random() * 25 : 0;
    const speed = running ? Math.max(0, Math.sin(t / 3) * 70) : 0;
    const cool = Math.min(90, 20 + t * 1.5);
    return { rpm, speed, cool, running, t };
  }

  obd(b) {
    const v = this.live();
    const svc = b[0];
    const pidVal = {
      0x01: () => [this.storedCleared ? 0x00 : 0x82, 0x0f, 0xeb, 0x40],
      0x04: () => [Math.round((v.running ? 22 + v.speed / 3 : 0) * 2.55)],
      0x05: () => [Math.round(v.cool + 40)],
      0x0b: () => [Math.round(100 + v.speed * 1.2)],
      0x0c: () => { const r = Math.round(v.rpm * 4); return [r >> 8, r & 0xff]; },
      0x0d: () => [Math.round(v.speed)],
      0x0f: () => [Math.round(28 + 40)],
      0x10: () => { const m = Math.round((8 + v.speed * 0.6) * 100); return [m >> 8, m & 0xff]; },
      0x11: () => [Math.round(v.speed * 1.1 * 2.55)],
      0x1f: () => { const s = Math.round(v.t); return [s >> 8, s & 0xff]; },
      0x21: () => this.storedCleared ? [0, 0] : [0x00, 0x2a],
      0x23: () => { const p = Math.round((300 + v.rpm * 0.4) * 10); return [p >> 8, p & 0xff]; },
      0x2c: () => [Math.round((v.speed < 20 ? 35 : 5) * 2.55)],
      0x2f: () => [Math.round(62 * 2.55)],
      0x30: () => [this.storedCleared ? 0 : 14],
      0x31: () => this.storedCleared ? [0, 0] : [0x04, 0xd2],
      0x33: () => [99],
      0x42: () => { const mv = Math.round((v.running ? 14.1 : 12.5) * 1000 + Math.random() * 40); return [mv >> 8, mv & 0xff]; },
      0x46: () => [Math.round(14 + 40)],
      0x49: () => [Math.round(v.speed * 1.2 * 2.55)],
      0x4d: () => [0x00, 0x8c],
      0x4e: () => this.storedCleared ? [0, 1] : [0x0b, 0x40],
      0x5c: () => [Math.round(Math.min(95, 18 + v.t * 1.2) + 40)],
      0x62: () => [Math.round(125 + (v.running ? v.speed / 2 : 0))],
      0x63: () => [0x01, 0x54],
      0xa6: () => { const km = 1484210; return [(km >>> 24) & 0xff, (km >> 16) & 0xff, (km >> 8) & 0xff, km & 0xff]; },
    };
    const supported = Object.keys(pidVal).map(Number);
    const bitmap = (base) => {
      const out = [0, 0, 0, 0];
      for (const p of supported) if (p > base && p <= base + 32) out[(p - base - 1) >> 3] |= 0x80 >> ((p - base - 1) & 7);
      if (supported.some((p) => p > base + 32)) out[3] |= 0x01;
      return out;
    };
    if (svc === 0x01) {
      const resp = [0x41];
      for (const pid of b.slice(1)) {
        if (pid % 0x20 === 0) { if (pid <= 0xa0) resp.push(pid, ...bitmap(pid)); }
        else if (pidVal[pid]) resp.push(pid, ...pidVal[pid]());
      }
      return resp.length > 1 ? resp : null;
    }
    if (svc === 0x02) {
      const pid = b[1];
      if (this.storedCleared) return null;
      if (pid === 0x02) return [0x42, 0x02, 0x00, 0x02, 0x99];
      if (pidVal[pid]) return [0x42, pid, 0x00, ...pidVal[pid]()];
      return null;
    }
    if (svc === 0x03) return this.storedCleared ? [0x43, 0x00] : [0x43, 0x02, 0x02, 0x99, 0x24, 0x63];
    if (svc === 0x07) return [0x47, 0x01, 0x20, 0xee];
    if (svc === 0x0a) return [0x4a, 0x00];
    if (svc === 0x04) { this.storedCleared = true; MODULES[0x7e0].dtcs = []; return [0x44]; }
    if (svc === 0x09 && b[1] === 0x02) return [0x49, 0x02, 0x01, ...Buffer.from(VIN, "latin1")];
    if (svc === 0x09 && b[1] === 0x0a) return [0x49, 0x0a, 0x01, ...Buffer.from("ECM-EngineControl\0\0\0", "latin1")];
    if (svc === 0x09 && b[1] === 0x00) return [0x49, 0x00, 0x54, 0x40, 0x00, 0x00];
    return null;
  }

  uds(m, b) {
    const sid = b[0];
    if (sid === 0x22) {
      const did = h2(b[1]) + h2(b[2]);
      const v = m.ids[did];
      if (v === undefined) return [[0x7f, 0x22, 0x31]];
      return [[0x62, b[1], b[2], ...Buffer.from(v, "latin1")]];
    }
    if (sid === 0x3e) return [[0x7e, 0x00]];
    if (sid === 0x10) { this.s.ext = b[1] === 0x03; return [[0x50, b[1], 0x00, 0x32, 0x01, 0xf4]]; }
    if (sid === 0x19) {
      const out = [0x59, 0x02, 0xff];
      for (const d of m.dtcs) out.push(...d);
      return m.pending78 ? [[0x7f, 0x19, 0x78], out] : [out];
    }
    if (sid === 0x14) {
      if (m.needsExtended && !this.s.ext) return [[0x7f, 0x14, 0x22]];
      m.dtcs = [];
      return [[0x54]];
    }
    return [[0x7f, sid, 0x11]];
  }
}

module.exports = { SimTransport };
