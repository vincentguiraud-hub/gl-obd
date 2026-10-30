// Faux calculateur UDS (pour le mode démo et les tests) + réception ISO-TP manuelle (ATCAF0)
"use strict";
const h4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");

class FakeEcu {
  constructor(o) {
    this.ids = o.ids || {};
    this.dtcs = o.dtcs || [];
    this.coding = o.coding || null; // tableau d'octets (DID 0600)
    this.dids = o.dids || {}; // { "1234": [octets] ou () => [octets] }
    this.writable = new Set(o.writable || []);
    this.needsExtended = !!o.needsExtended;
    this.pending78 = !!o.pending78;
    this.loginCode = o.loginCode ?? null;
    this.routines = o.routines || {};
    this.snap = o.snap || {};
    this.session = 1; this.unlocked = false; this.seed = 0;
  }

  readDid(did) {
    if (did === "0600" && this.coding) return this.coding;
    if (this.ids[did] !== undefined) return [...Buffer.from(this.ids[did], "latin1")];
    const v = this.dids[did];
    if (v !== undefined) return typeof v === "function" ? v() : v;
    if (did === "F186") return [this.session];
    return null;
  }

  // renvoie une liste de réponses (une réponse « en attente » 0x78 peut précéder)
  handle(b) {
    const sid = b[0];
    const neg = (c) => [[0x7f, sid, c]];
    if (sid === 0x22) {
      const out = [0x62];
      for (let i = 1; i + 1 < b.length; i += 2) {
        const did = h4((b[i] << 8) | b[i + 1]);
        const v = this.readDid(did);
        if (v === null) { if (b.length === 3) return neg(0x31); continue; }
        out.push(b[i], b[i + 1], ...v);
      }
      return out.length > 1 ? [out] : neg(0x31);
    }
    if (sid === 0x3e) return [[0x7e, 0x00]];
    if (sid === 0x10) { this.session = b[1]; if (b[1] === 1) this.unlocked = false; return [[0x50, b[1], 0x00, 0x32, 0x01, 0xf4]]; }
    if (sid === 0x11) { this.session = 1; this.unlocked = false; return [[0x51, b[1]]]; }
    if (sid === 0x19) {
      if (b[1] === 0x01) return [[0x59, 0x01, 0xff, 0x01, 0x00, this.dtcs.length]];
      if (b[1] === 0x02) { const out = [0x59, 0x02, 0xff]; for (const d of this.dtcs) out.push(...d); return this.pending78 ? [[0x7f, 0x19, 0x78], out] : [out]; }
      const d = this.dtcs.find((x) => x[0] === b[2] && x[1] === b[3] && x[2] === b[4]);
      if (!d) return neg(0x31);
      if (b[1] === 0x04) {
        const s = this.snap[d.slice(0, 3).join(",")];
        if (!s) return [[0x59, 0x04, ...d]];
        return [[0x59, 0x04, ...d, ...s.snapshot]];
      }
      if (b[1] === 0x06) {
        const s = this.snap[d.slice(0, 3).join(",")];
        return [[0x59, 0x06, ...d, ...(s ? s.extended : [])]];
      }
      return neg(0x12);
    }
    if (sid === 0x14) {
      if (this.needsExtended && this.session !== 3) return neg(0x22);
      this.dtcs = []; return [[0x54]];
    }
    if (sid === 0x27) {
      if (this.loginCode === null) return neg(0x12);
      if (b[1] % 2 === 1) { this.seed = 0x1a2b3c4d; return [[0x67, b[1], 0x1a, 0x2b, 0x3c, 0x4d]]; }
      const key = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
      if (key === ((this.seed + this.loginCode) >>> 0)) { this.unlocked = true; return [[0x67, b[1]]]; }
      return neg(0x35);
    }
    if (sid === 0x2e) {
      const did = h4((b[1] << 8) | b[2]);
      if (this.session === 1) return neg(0x7f);
      if (did === "0600" && this.coding) {
        if (this.loginCode !== null && !this.unlocked) return neg(0x33);
        if (b.length - 3 !== this.coding.length) return neg(0x13);
        this.coding = b.slice(3); return [[0x6e, b[1], b[2]]];
      }
      if (!this.writable.has(did)) return neg(0x31);
      if (this.loginCode !== null && !this.unlocked) return neg(0x33);
      this.dids[did] = b.slice(3); return [[0x6e, b[1], b[2]]];
    }
    if (sid === 0x31) {
      const id = h4((b[2] << 8) | b[3]);
      const r = this.routines[id];
      if (!r) return neg(0x31);
      if (this.session === 1) return neg(0x7f);
      return [[0x71, b[1], b[2], b[3], ...(r[b[1]] || [0x00])]];
    }
    return neg(0x11);
  }
}

// Réassemblage des trames envoyées à la main (ATCAF0) par le logiciel
class IsoTpRx {
  constructor() { this.buf = null; }
  // renvoie { done: payload } ou { fc: true } ou { ignore: true }
  push(bytes) {
    const t = bytes[0] >> 4;
    if (t === 0) return { done: bytes.slice(1, 1 + (bytes[0] & 15)) };
    if (t === 1) { this.len = ((bytes[0] & 15) << 8) | bytes[1]; this.buf = bytes.slice(2); return { fc: true }; }
    if (t === 2 && this.buf) {
      this.buf.push(...bytes.slice(1));
      if (this.buf.length >= this.len) { const p = this.buf.slice(0, this.len); this.buf = null; return { done: p }; }
      return { ignore: true };
    }
    return { ignore: true };
  }
}

module.exports = { FakeEcu, IsoTpRx };
