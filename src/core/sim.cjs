// Simulateur d'adaptateur ELM327 branché sur un VW Crafter 2019 2.0 TDI.
// Sert au « mode démo » (essayer l'appli sans voiture) et aux tests.
"use strict";
const { EventEmitter } = require("events");

const h2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");
const VIN = "WV1ZZZSYZK9012345";

const { FakeEcu, IsoTpRx } = require("./fakeecu.cjs");
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

function makeModules(sim) {
  const live = () => sim.live();
  const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
  return {
    0x7e0: { resp: 0x7e8, ecu: new FakeEcu({
      ids: { F197: "R4 2.0l TDI", F187: "04L907309R", F189: "0003", F191: "04L907309R", F1A3: "H17", F18C: "VWZ6Z0K0123456", F19E: "EV_ECM20TDI01104L907309R", F1A2: "001003", F17C: "FAZ-00123", F190: VIN, F18B: "190417", F199: "200312", F198: "00000" },
      coding: [0x01, 0x1a, 0x00, 0x10, 0x00, 0x00, 0x00, 0x24, 0x00],
      dids: {
        "1001": () => u16(Math.round(live().rpm)), "1002": () => [Math.round(live().cool + 40)], "1003": () => u16(Math.round((1000 + live().speed * 12))),
        "1004": () => u16(Math.round(300 + live().rpm * 0.4)), "1005": () => [62], "1006": () => u16(rnd(1180, 1220)), "1007": () => u16(14842),
        "100C": [0x00, 0x2a, 0x13, 0x88], F15B: [0x20, 0x03, 0x12, 0x00, 0x00, 0x00, 0x01, 0x23, 0x45], "2032": [0x00, 0x00, 0x4b], "295A": [0x02, 0x43, 0xc0], "02BD": [0x05],
      },
      writable: ["1005"],
      routines: { "0183": { 1: [0x00], 3: [0x02, 0x41] } },
      dtcs: [[0x02, 0x99, 0x00, 0x09], [0x24, 0x63, 0x00, 0x08], [0x20, 0xee, 0x00, 0x04]], pending78: true, refuse14: true,
      snap: {
        "2,153,0": { snapshot: [0x01, 0x02, 0x10, 0x01, 0x07, 0xd8, 0x10, 0x03, 0x04, 0xb0], extended: [0x01, 0x03, 0x02, 0x00, 0x2a, 0x13, 0x88] },
        "36,99,0": { snapshot: [0x01, 0x01, 0x10, 0x02, 0x5a], extended: [0x01, 0x0b] },
      },
    }) },
    0x713: { resp: 0x77d, ecu: new FakeEcu({ ids: { F197: "ESC", F187: "2N0907379H", F189: "0280", F191: "2N0614517A", F1A3: "H09", F18C: "TRW1234567" }, coding: [0x00, 0x34, 0x12, 0x80, 0x00, 0x11, 0x08], dtcs: [[0x40, 0x35, 0x1c, 0x2c]], snap: { "64,53,28": { snapshot: [0x01, 0x01, 0x10, 0x03, 0x00, 0x00], extended: [0x01, 0x01] } } }) },
    0x715: { resp: 0x77f, ecu: new FakeEcu({ ids: { F197: "Airbag VW8R", F187: "2N0959655B", F189: "0812", F1A3: "H05" }, coding: [0x00, 0x00, 0x10, 0x24, 0x00, 0x00], dtcs: [] }) },
    0x714: { resp: 0x77e, ecu: new FakeEcu({ ids: { F197: "KOMBI", F187: "7C0920740B", F189: "0211", F1A3: "H12" }, coding: [0x22, 0x0b, 0x00, 0x80, 0x00, 0x02], dids: { "2203": [0x02, 0x43, 0xc5], "2210": [0x00, 0x2a] }, dtcs: [[0xc1, 0x21, 0x00, 0x09]] }) },
    0x710: { resp: 0x77a, ecu: new FakeEcu({ ids: { F197: "Gateway MQB-B", F187: "2Q0907530AA", F189: "2228", F1A3: "H14" }, coding: [0x01, 0x00, 0x7f, 0xff, 0xa3, 0x00, 0x10, 0x00], dtcs: [] }) },
    0x70e: { resp: 0x778, ecu: new FakeEcu({ ids: { F197: "BCM MQB-B High", F187: "7C0937084", F189: "0105", F1A3: "H22" }, coding: Array.from({ length: 30 }, (_, i) => [0x2d, 0x1a, 0x02, 0x00, 0x80, 0x48][i % 6]), loginCode: 31347, needsExtended: true, dtcs: [[0x90, 0x52, 0x13, 0x08]] }) },
    0x712: { resp: 0x77c, ecu: new FakeEcu({ ids: { F197: "EPS_ZFLS Kl.11", F187: "7C1909144A", F189: "2701", F1A3: "H04" }, dtcs: [] }) },
    0x746: { resp: 0x7b0, ecu: new FakeEcu({ ids: { F197: "Climatronic", F187: "7C0907044", F189: "0302", F1A3: "H03" }, dtcs: [] }) },
    0x74f: { resp: 0x7b9, ecu: new FakeEcu({ ids: { F197: "Frontkamera", F187: "3QD980654", F189: "0410", F1A3: "H06" }, dtcs: [] }) },
    0xda28f1: { resp: 0x18daf128, ecu: new FakeEcu({ ids: { F197: "Body Control 29bit", F187: "TEST29" }, dids: { "1234": [0x01, 0xf4] }, dtcs: [] }) },
    0x70a: { resp: 0x774, ecu: new FakeEcu({ ids: { F197: "Parkhilfe 8K", F187: "2Q0919294", F189: "0204" }, dtcs: [[0xc1, 0x56, 0x00, 0x08]] }) },
    0x74a: { resp: 0x7b4, ecu: new FakeEcu({ ids: { F197: "TSG FT", F187: "7C0959593", F189: "0123" }, dtcs: [] }) },
    0x74b: { resp: 0x7b5, ecu: new FakeEcu({ ids: { F197: "TSG BT", F187: "7C0959592", F189: "0123" }, dtcs: [] }) },
    0x767: { resp: 0x7d1, ecu: new FakeEcu({ ids: { F197: "OCU3 eCall", F187: "3QF035284", F189: "0507" }, dtcs: [] }) },
    0x73a: { resp: 0x7a4, ecu: new FakeEcu({ ids: { F197: "Standheizung", F187: "7C0963513", F189: "0101" }, dtcs: [[0x90, 0x11, 0x16, 0x08]] }) },
  };
}

class SimTransport extends EventEmitter {
  constructor() {
    super();
    this.reset();
    this.t0 = Date.now();
    this.storedCleared = false;
    this.modules = makeModules(this);
    this.rx = new IsoTpRx();
  }
  reset() { this.s = { echo: true, h: false, sp: true, sh: 0x7df, cra: null, proto: "0", caf: true, r: true }; this.stopMon(); }
  stopMon() { if (this.mon) { clearInterval(this.mon); this.mon = null; return true; } return false; }
  async open() {}
  close() { this.emit("close"); }
  write(str) {
    if (this.stopMon()) { setTimeout(() => this.emit("data", Buffer.from("\r\r>", "latin1")), 5); return; }
    const cmd = str.replace(/\r$/, "").trim();
    if (/^ATMA$/i.test(cmd)) return this.sniff(cmd);
    const out = this.handle(cmd.toUpperCase().replace(/\s+/g, ""));
    const echo = this.s.echo ? cmd + "\r" : "";
    setTimeout(() => this.emit("data", Buffer.from(echo + out + "\r\r>", "latin1")), 8);
  }

  handle(c) {
    if (c === "") return "";
    if (c.startsWith("AT")) return this.at(c.slice(2));
    if (!/^[0-9A-F]+$/.test(c) || c.length % 2) return "?";
    if (this.s.proto === "0") this.s.proto = "6";
    let bytes = c.match(/../g).map((x) => parseInt(x, 16));
    const lines = [];
    let m = this.modules[this.s.sh];
    if (m && (this.s.sh > 0xfff) !== (this.s.proto === "7")) m = null; // 29 bits seulement en protocole 7
    if (!this.s.caf) {
      // trame brute avec octet PCI (envoi multi-trames manuel)
      if (!m) return this.s.r ? "NO DATA" : "";
      const r = this.rx.push(bytes);
      if (r.fc) return this.s.r ? this.frames(m.resp, [], [0x30, 0x00, 0x00]).join("\r") : "";
      if (!r.done) return this.s.r ? "NO DATA" : "";
      bytes = r.done;
    }
    if (this.s.sh === 0x7df || (this.s.sh === 0x7e0 && bytes[0] < 0x10)) {
      const p = this.obd(bytes);
      if (p) lines.push(...this.frames(0x7e8, p));
    } else if (m && (this.s.cra === null || this.s.cra === m.resp)) {
      for (const p of m.ecu.handle(bytes)) lines.push(...this.frames(m.resp, p));
    }
    if (!this.s.r) return "";
    return lines.length ? lines.join("\r") : "NO DATA";
  }

  at(a) {
    const s = this.s;
    if (a === "Z") { this.reset(); return "\r\rELM327 v1.5"; }
    if (a === "I") return "ELM327 v1.5";
    if (a === "@1") return "G&L DEMO OBDII";
    if (a === "RV") return (Date.now() - this.t0 > 3000 ? 14.1 : 12.6).toFixed(1) + "V";
    if (a === "DPN") return s.proto === "0" ? "A6" : s.proto;
    if (a.startsWith("CP")) return "OK";
    if (a === "DP") return "ISO 15765-4 (CAN 11/500)";
    if (a.startsWith("E")) { s.echo = a[1] === "1"; return "OK"; }
    if (a.startsWith("H")) { s.h = a[1] === "1"; return "OK"; }
    if (a.startsWith("S") && /^S[01]$/.test(a)) { s.sp = a[1] === "1"; return "OK"; }
    if (a.startsWith("SP")) { s.proto = a.slice(2) === "0" ? "0" : a.slice(2); return "OK"; }
    if (a.startsWith("SH")) { s.sh = parseInt(a.slice(2), 16); return "OK"; }
    if (a.startsWith("CRA")) { s.cra = a.length > 3 ? parseInt(a.slice(3), 16) : null; return "OK"; }
    if (/^CAF[01]$/.test(a)) { s.caf = a[3] === "1"; return "OK"; }
    if (/^R[01]$/.test(a)) { s.r = a[1] === "1"; return "OK"; }
    return "OK";
  }

  frames(id, p, raw) {
    const idh = id > 0xfff ? id.toString(16).toUpperCase().padStart(8, "0").match(/../g).join(" ") : id.toString(16).toUpperCase();
    const fmt = (arr) => {
      while (arr.length < 8) arr.push(0xaa);
      return this.s.h ? `${idh} ${arr.map(h2).join(" ")}` : arr.map(h2).join(" ");
    };
    if (raw) return [fmt(raw)];
    if (p.length <= 7) return [fmt([p.length, ...p])];
    const out = [fmt([0x10 | (p.length >> 8), p.length & 0xff, ...p.slice(0, 6)])];
    let sn = 1;
    for (let i = 6; i < p.length; i += 7, sn = (sn + 1) & 0xf) out.push(fmt([0x20 | sn, ...p.slice(i, i + 7)]));
    return out;
  }

  live() {
    const t = (Date.now() - this.t0) / 1000;
    const running = t > 3;
    const ph = Math.max(0, Math.sin((t - 3) / 3));
    const rpm = running ? 820 + ph * 3000 + Math.random() * 25 : 0;
    const speed = running ? ph * 130 : 0;
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
      0x70: () => { const c = Math.round((100 + v.speed * 1.4) / 0.03125), a = Math.round((100 + v.speed * 1.2) / 0.03125); return [0x03, c >> 8, c & 0xff, a >> 8, a & 0xff, 0, 0, 0, 0]; },
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
    if (svc === 0x04) { this.storedCleared = true; this.modules[0x7e0].ecu.dtcs = []; return [0x44]; }
    if (svc === 0x09 && b[1] === 0x02) return [0x49, 0x02, 0x01, ...Buffer.from(VIN, "latin1")];
    if (svc === 0x09 && b[1] === 0x0a) return [0x49, 0x0a, 0x01, ...Buffer.from("ECM-EngineControl\0\0\0", "latin1")];
    if (svc === 0x09 && b[1] === 0x00) return [0x49, 0x00, 0x54, 0x40, 0x00, 0x00];
    if (svc === 0x09 && b[1] === 0x04) return [0x49, 0x04, 0x01, ...Buffer.from("04L907309R  0003", "latin1")];
    if (svc === 0x09 && b[1] === 0x06) return [0x49, 0x06, 0x01, 0x8a, 0x3f, 0x11, 0xc2];
    if (svc === 0x09 && b[1] === 0x0b) { const v = [412, 518, 37, 95, 22, 88, 0, 0, 14, 96, 51, 110, 210, 312, 180, 260]; return [0x49, 0x0b, 0x10, ...v.flatMap((x) => [x >> 8, x & 0xff])]; }
    if (svc === 0x06) {
      const mid = b[1];
      if (mid === 0x00) return [0x46, 0x00, 0x00, 0x00, 0x00, 0x01];
      if (mid === 0x20) return [0x46, 0x20, 0x00, 0x00, 0x80, 0x01];
      if (mid === 0x40) return [0x46, 0x40, 0x00, 0x00, 0x00, 0x01];
      if (mid === 0x60) return [0x46, 0x60, 0x00, 0x00, 0x00, 0x01];
      if (mid === 0x80) return [0x46, 0x80, 0x0c, 0x00, 0x00, 0x01];
      if (mid === 0xa0) return [0x46, 0xa0, 0xf0, 0x01, 0x00, 0x01];
      if (mid === 0xc0) return [0x46, 0xc0, 0x00, 0x00, 0x00, 0x00];
      const T = {
        0x31: [[0x01, 0x24, 12, 0, 40], [0x02, 0x24, 3, 0, 10]],
        0x85: [[0x01, 0x1a, 152, 140, 255]], 0x86: [[0x02, 0x1a, 131, 140, 255]],
        0xa1: [[0x0b, 0x24, 0, 0, 65535], [0x0c, 0x24, 2, 0, 65535]], 0xa2: [[0x0b, 0x24, 2, 0, 50]],
        0xa3: [[0x0b, 0x24, 0, 0, 50]], 0xa4: [[0x0b, 0x24, 1, 0, 50]],
        0xb0: [[0x01, 0x96, 640, 0, 680], [0x02, 0x17, 1850, 0, 2400]],
      }[mid];
      if (!T) return null;
      return [0x46, ...T.flatMap(([tid, u, v, mn, mx]) => [mid, tid, u, v >> 8, v & 0xff, mn >> 8, mn & 0xff, mx >> 8, mx & 0xff])];
    }
    return null;
  }

  sniff(cmd) {
    const echo = this.s.echo ? cmd + "\r" : "";
    this.emit("data", Buffer.from(echo, "latin1"));
    let n = 0;
    this.mon = setInterval(() => {
      n++;
      const v = this.live(), L = [];
      const f = (id, d) => L.push(`${id.toString(16).toUpperCase()} ${d.map(h2).join(" ")}`);
      f(0x280, [0x00, 0x00, ...[(Math.round(v.rpm * 4) & 0xff), (Math.round(v.rpm * 4) >> 8)], 0x00, 0x00, 0x00, 0x00]);
      if (n % 2) f(0x1a0, [0x00, 0xa0, Math.round(v.speed * 2) & 0xff, 0x00, 0xfe, 0xfe, 0x00, 0x10]);
      if (n % 5 === 0) f(0x5c0, [n & 0xff, 0x40, 0x00, 0x00]);
      if (n % 10 === 0) f(0x3c0, [0x12, (n >> 3) & 0x0f, 0x03, 0x00]);
      this.emit("data", Buffer.from(L.join("\r") + "\r", "latin1"));
    }, 20);
  }

}

module.exports = { SimTransport };
