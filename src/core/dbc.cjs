// Lecteur de fichiers DBC (description des trames CAN) : décodage et encodage des signaux.
"use strict";

function parseDbc(text) {
  const msgs = new Map(); // id (nombre) -> { id, name, len, signals: [] }
  let cur = null;
  const vals = [];
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim();
    let m;
    if ((m = line.match(/^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/))) {
      let id = Number(m[1]);
      const ext = id > 0x7fffffff; if (ext) id &= 0x1fffffff;
      cur = { id, ext, name: m[2], len: Number(m[3]), node: m[4], signals: [] };
      msgs.set(id, cur);
    } else if (cur && (m = line.match(/^SG_\s+(\w+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]*)\|([^\]]*)\]\s*"([^"]*)"/))) {
      cur.signals.push({
        name: m[1], mux: m[2] === "M" ? "M" : m[2] ? Number(m[2].slice(1)) : null,
        start: Number(m[3]), size: Number(m[4]), intel: m[5] === "1", signed: m[6] === "-",
        factor: Number(m[7]), offset: Number(m[8]), min: Number(m[9]), max: Number(m[10]), unit: m[11],
      });
    } else if ((m = line.match(/^VAL_\s+(\d+)\s+(\w+)\s+(.*);/))) {
      vals.push([Number(m[1]), m[2], m[3]]);
    } else if (!line.startsWith("SG_")) cur = line.startsWith("BO_") ? cur : cur && line === "" ? null : cur;
  }
  for (const [id, sig, rest] of vals) {
    const msg = msgs.get(id & 0x1fffffff); if (!msg) continue;
    const s = msg.signals.find((x) => x.name === sig); if (!s) continue;
    s.values = {};
    for (const mm of rest.matchAll(/(-?\d+)\s+"([^"]*)"/g)) s.values[mm[1]] = mm[2];
  }
  return msgs;
}

// Extraction des bits bruts (BigInt pour les signaux > 32 bits)
function rawBits(data, s) {
  let v = 0n;
  if (s.intel) {
    for (let i = 0; i < s.size; i++) {
      const bit = s.start + i, byte = bit >> 3;
      if (byte >= data.length) return null;
      if ((data[byte] >> (bit & 7)) & 1) v |= 1n << BigInt(i);
    }
  } else {
    // Motorola : bit de départ = bit de poids fort, numérotation « en dents de scie »
    let bit = s.start;
    for (let i = 0; i < s.size; i++) {
      const byte = bit >> 3;
      if (byte >= data.length) return null;
      v = (v << 1n) | BigInt((data[byte] >> (bit & 7)) & 1);
      bit = (bit & 7) === 0 ? bit + 15 : bit - 1;
    }
  }
  if (s.signed && s.size > 0 && (v >> BigInt(s.size - 1)) & 1n) v -= 1n << BigInt(s.size);
  return v;
}

function decodeMsg(msg, data) {
  const out = {};
  const muxSig = msg.signals.find((s) => s.mux === "M");
  const muxVal = muxSig ? Number(rawBits(data, muxSig)) : null;
  for (const s of msg.signals) {
    if (typeof s.mux === "number" && s.mux !== muxVal) continue;
    const r = rawBits(data, s);
    if (r === null) continue;
    const value = Number(r) * s.factor + s.offset;
    out[s.name] = { value, unit: s.unit, text: s.values ? s.values[String(Number(r))] : undefined, raw: Number(r) };
  }
  return { mux: muxVal, signals: out };
}

// Encodage (sert au simulateur)
function encodeMsg(msg, values, mux) {
  const data = new Array(msg.len).fill(0);
  for (const s of msg.signals) {
    let v;
    if (s.mux === "M") v = mux ?? 0;
    else if (typeof s.mux === "number" && s.mux !== mux) continue;
    else if (values[s.name] === undefined) continue;
    else v = Math.round((values[s.name] - s.offset) / s.factor);
    let r = BigInt(v); if (r < 0n) r += 1n << BigInt(s.size);
    if (s.intel) {
      for (let i = 0; i < s.size; i++) { const bit = s.start + i; if ((r >> BigInt(i)) & 1n) data[bit >> 3] |= 1 << (bit & 7); }
    } else {
      let bit = s.start;
      for (let i = s.size - 1; i >= 0; i--) { if ((r >> BigInt(i)) & 1n) data[bit >> 3] |= 1 << (bit & 7); bit = (bit & 7) === 0 ? bit + 15 : bit - 1; }
    }
  }
  return data;
}

module.exports = { parseDbc, decodeMsg, encodeMsg, rawBits };
