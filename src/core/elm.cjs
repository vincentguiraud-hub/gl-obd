// Pilote ELM327 : envoi des commandes, lecture jusqu'au prompt « > »,
// découpage des réponses par calculateur et réassemblage ISO-TP (CAN).
"use strict";

const NOISE = /^(SEARCHING\.\.\.|BUS INIT:.*|OK|STOPPED)$/i;
const ERRORS = ["UNABLE TO CONNECT", "CAN ERROR", "BUS ERROR", "BUS BUSY", "FB ERROR", "DATA ERROR", "LV RESET", "ACT ALERT", "BUFFER FULL", "RX ERROR", "ERR"];

const PROTOCOLS = {
  "0": "Automatique",
  "1": "SAE J1850 PWM (41,6 kbaud)",
  "2": "SAE J1850 VPW (10,4 kbaud)",
  "3": "ISO 9141-2 (5 baud init)",
  "4": "ISO 14230-4 KWP (5 baud init)",
  "5": "ISO 14230-4 KWP (init rapide)",
  "6": "ISO 15765-4 CAN (11 bits, 500 kbaud)",
  "7": "ISO 15765-4 CAN (29 bits, 500 kbaud)",
  "8": "ISO 15765-4 CAN (11 bits, 250 kbaud)",
  "9": "ISO 15765-4 CAN (29 bits, 250 kbaud)",
  "A": "SAE J1939 CAN (29 bits, 250 kbaud)",
};

class ElmError extends Error {}

class Elm {
  constructor(transport, log = () => {}) {
    this.t = transport;
    this.log = log;
    this.buf = "";
    this.waiter = null;
    this.queue = Promise.resolve();
    this.protocol = null; // numéro ATDPN (ex. "6")
    this.version = "";
    this.state = {}; // dernier en-tête / filtre envoyés (évite les commandes AT inutiles)
    this.t.on("data", (chunk) => this._onData(chunk));
  }

  _onData(chunk) {
    this.buf += chunk.toString("latin1");
    const i = this.buf.indexOf(">");
    if (i >= 0 && this.waiter) {
      const out = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      const w = this.waiter;
      this.waiter = null;
      clearTimeout(w.timer);
      w.resolve(out);
    }
  }

  // Envoie une commande brute et renvoie le texte reçu avant « > ». Sérialisé.
  send(cmd, timeoutMs = 4000) {
    const run = () =>
      new Promise((resolve, reject) => {
        this.buf = "";
        const timer = setTimeout(() => {
          this.waiter = null;
          reject(new ElmError(`Pas de réponse de l'adaptateur à « ${cmd} »`));
        }, timeoutMs);
        this.waiter = { resolve, timer };
        this.log("tx", cmd);
        this.t.write(cmd + "\r");
      }).then((raw) => {
        this.log("rx", raw.replace(/\r+/g, "\n").trim());
        return raw;
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async at(cmd, timeoutMs = 2000) {
    const raw = await this.send(cmd, timeoutMs);
    return raw.replace(/[\r\n>]+/g, " ").replace(cmd, "").trim();
  }

  async init() {
    // Réveil : certains clones ignorent le premier caractère
    try { await this.send("", 1500); } catch {}
    let id = "";
    try { id = await this.at("ATZ", 5000); } catch { id = await this.at("ATZ", 5000); }
    this.version = (id.match(/ELM327[^\r\n>]*/i) || [id])[0].trim();
    await this.at("ATE0");
    await this.at("ATL0");
    await this.at("ATS1");
    await this.at("ATH1");
    await this.at("ATAT1");
    await this.at("ATSP0");
    this.state = {};
    // Lance la recherche du protocole avec une vraie requête
    const raw = await this.send("0100", 20000);
    const txt = raw.toUpperCase();
    if (txt.includes("UNABLE TO CONNECT") || txt.includes("NO DATA") && !/41\s*00/.test(txt)) {
      throw new ElmError("L'adaptateur répond mais la voiture ne répond pas. Mets le contact (moteur arrêté ou tournant) et réessaie.");
    }
    const dp = (await this.at("ATDPN")).replace(/^A/, "").trim().slice(-1);
    this.protocol = dp;
    return { version: this.version, protocol: dp, protocolName: PROTOCOLS[dp] || dp };
  }

  get isCan() { return ["6", "7", "8", "9"].includes(this.protocol); }
  get is29() { return ["7", "9"].includes(this.protocol); }

  async voltage() {
    const v = await this.at("ATRV");
    const m = v.match(/(\d+(?:\.\d+)?)\s*V/i);
    return m ? parseFloat(m[1]) : null;
  }

  // Envoie une requête OBD/UDS (hex) et renvoie [{ id, data:[octets] }, ...]
  // Chaque élément est un message complet (ISO-TP réassemblé sur CAN).
  async request(hex, timeoutMs = 6000) {
    const raw = await this.send(hex.replace(/\s+/g, ""), timeoutMs);
    return this.parse(raw);
  }

  parse(raw) {
    const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const msgs = [];
    const partial = new Map(); // id -> { len, data }
    for (const line0 of lines) {
      const line = line0.toUpperCase();
      if (NOISE.test(line)) continue;
      if (line === "NO DATA" || line === "?") continue;
      if (ERRORS.some((e) => line.includes(e))) throw new ElmError(`Erreur adaptateur : ${line0}`);
      if (!/^[0-9A-F ]+$/.test(line)) continue;
      let tok = line.split(/\s+/);
      // Lignes sans espace (au cas où l'adaptateur ignore ATS1)
      if (tok.length === 1 && tok[0].length > 3) tok = splitCompact(tok[0], this);
      if (this.isCan) {
        let id, bytes;
        if (this.is29) {
          if (tok.length < 5) continue;
          id = tok.slice(0, 4).join("");
          bytes = tok.slice(4).map((h) => parseInt(h, 16));
        } else {
          if (tok[0].length !== 3) continue;
          id = tok[0];
          bytes = tok.slice(1).map((h) => parseInt(h, 16));
        }
        if (!bytes.length) continue;
        const type = bytes[0] >> 4;
        if (type === 0) {
          const len = bytes[0] & 0x0f;
          msgs.push({ id, data: bytes.slice(1, 1 + len) });
        } else if (type === 1) {
          const len = ((bytes[0] & 0x0f) << 8) | bytes[1];
          partial.set(id, { len, data: bytes.slice(2) });
        } else if (type === 2) {
          const p = partial.get(id);
          if (!p) continue;
          p.data.push(...bytes.slice(1));
          if (p.data.length >= p.len) {
            msgs.push({ id, data: p.data.slice(0, p.len) });
            partial.delete(id);
          }
        }
      } else {
        const bytes = tok.map((h) => parseInt(h, 16));
        if (bytes.length < 5) continue;
        msgs.push({ id: tok[2], data: bytes.slice(3, -1) });
      }
    }
    // messages incomplets : on les rend quand même
    for (const [id, p] of partial) msgs.push({ id, data: p.data, incomplete: true });
    return msgs;
  }

  // ---- Communication directe avec un calculateur (CAN 11 bits) ----
  async target(reqId, respId) {
    const s = this.state;
    if (s.sh !== reqId) { await this.at(`ATSH${reqId}`); s.sh = reqId; }
    if (s.cra !== respId) { await this.at(`ATCRA${respId}`); s.cra = respId; }
    if (s.fcsh !== reqId) {
      await this.at(`ATFCSH${reqId}`);
      if (!s.fcsd) { await this.at("ATFCSD300000"); s.fcsd = true; }
      if (!s.fcsm) { await this.at("ATFCSM1"); s.fcsm = true; }
      s.fcsh = reqId;
    }
  }

  async setTimeoutByte(hex) {
    if (!this.state.at0) { await this.at("ATAT0"); this.state.at0 = true; }
    if (this.state.st !== hex) { await this.at(`ATST${hex}`); this.state.st = hex; }
  }

  async resetTarget() {
    const s = this.state;
    if (s.sh || s.cra || s.fcsm || s.st) {
      try { await this.at("ATCRA"); } catch {}
      try { await this.at("ATFCSM0"); } catch {}
      try { await this.at(this.is29 ? "ATSH18DB33F1" : "ATSH7DF"); } catch {}
      try { await this.at("ATST32"); } catch {}
      try { await this.at("ATAT1"); } catch {}
    }
    this.state = {};
  }

  // Requête UDS : renvoie le message positif (octets) ou lève une erreur NRC.
  async uds(hex, timeoutMs = 6000) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const msgs = await this.request(hex, timeoutMs);
      const sid = parseInt(hex.slice(0, 2), 16);
      const real = msgs.filter((m) => !(m.data[0] === 0x7f && m.data[2] === 0x78));
      if (real.length) {
        const m = real[real.length - 1];
        if (m.data[0] === 0x7f) {
          const e = new ElmError(`Refusé par le calculateur : ${nrcText(m.data[2])}`);
          e.nrc = m.data[2];
          throw e;
        }
        return m.data;
      }
      if (msgs.length) {
        // réponse en attente (0x78) : on relance une lecture
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      return null;
    }
    return null;
  }
}

function splitCompact(s, elm) {
  const out = [];
  let i = 0;
  if (elm.isCan && !elm.is29) { out.push(s.slice(0, 3)); i = 3; }
  for (; i < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out;
}

const NRC = {
  0x10: "refus général", 0x11: "service non supporté", 0x12: "sous-fonction non supportée",
  0x13: "longueur de message incorrecte", 0x14: "réponse trop longue", 0x21: "occupé, réessayer",
  0x22: "conditions non remplies", 0x24: "séquence de requêtes incorrecte", 0x31: "valeur hors limites",
  0x33: "accès sécurisé refusé", 0x35: "clé invalide", 0x36: "trop de tentatives", 0x37: "délai non écoulé",
  0x72: "erreur de programmation", 0x78: "réponse en attente", 0x7e: "non supporté dans cette session",
  0x7f: "service non supporté dans cette session",
};
function nrcText(c) { return `${NRC[c] || "code"} (0x${(c ?? 0).toString(16).toUpperCase().padStart(2, "0")})`; }

module.exports = { Elm, ElmError, PROTOCOLS, nrcText };
