// Atelier calculateur (UDS ISO 14229) : tout lire, tout explorer, coder, adapter, commander.
// Fonctionne sur les calculateurs voiture (CAN 11 bits) et camion (CAN 29 bits) :
// la fonction « open » fournie choisit l'adresse du calculateur.
"use strict";
const { dtcCode } = require("./obd.cjs");
const { describeDtc, ftbText } = require("./dtc.cjs");
const { nrcText } = require("./elm.cjs");

const hx = (a) => a.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const h4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");

// Identifiants normalisés ISO 14229 (+ quelques identifiants VW bien établis)
const ID_DIDS = [
  ["F190", "N° de série véhicule (VIN)"], ["F187", "Référence pièce"], ["F189", "Version logicielle"],
  ["F191", "Référence matériel"], ["F1A3", "Version matériel"], ["F197", "Nom du système"],
  ["F18C", "N° de série du calculateur"], ["F18B", "Date de fabrication"], ["F18A", "Fournisseur"],
  ["F188", "N° logiciel constructeur"], ["F192", "Réf. matériel fournisseur"], ["F193", "Version matériel fournisseur"],
  ["F194", "Réf. logiciel fournisseur"], ["F195", "Version logicielle fournisseur"], ["F180", "Logiciel de démarrage (boot)"],
  ["F181", "Logiciel application"], ["F182", "Données d'étalonnage"], ["F17C", "Code FAZIT (VW)"],
  ["F198", "Code atelier (dernier codage)"], ["F199", "Date de programmation"], ["F19E", "Fichier de données ODX/ASAM (VW)"],
  ["F1A2", "Version du jeu de données (VW)"], ["F1AA", "Nom du système atelier (VW)"], ["F1DF", "État de programmation"],
  ["F186", "Session active"], ["0600", "Codage long (VW)"],
];
const DID_NAMES = Object.fromEntries(ID_DIDS);

const ascii = (b) => (b.length && b.every((x) => (x >= 0x20 && x < 0x7f) || x === 0) ? String.fromCharCode(...b.filter((x) => x)).trim() : null);

// Propose plusieurs lectures d'une valeur brute (sans fichier constructeur on ne connaît pas l'échelle)
function interpret(b) {
  const out = { hex: hx(b), len: b.length };
  const a = ascii(b);
  if (a && a.length >= 2) out.ascii = a;
  if (b.length === 1) { out.u8 = b[0]; out.s8 = b[0] > 127 ? b[0] - 256 : b[0]; out.bits = b[0].toString(2).padStart(8, "0"); }
  if (b.length === 2) { const v = (b[0] << 8) | b[1]; out.u16 = v; out.s16 = v > 32767 ? v - 65536 : v; }
  if (b.length === 3) out.u24 = (b[0] << 16) | (b[1] << 8) | b[2];
  if (b.length === 4) { const v = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; out.u32 = v; out.s32 = v | 0; }
  return out;
}

function statusInfo(s) {
  return {
    raw: s, active: !!(s & 0x01), testFailedThisCycle: !!(s & 0x02), pending: !!(s & 0x04), confirmed: !!(s & 0x08),
    notCompletedSinceClear: !!(s & 0x10), failedSinceClear: !!(s & 0x20), notCompletedThisCycle: !!(s & 0x40), warning: !!(s & 0x80),
    label: s & 0x01 ? "Présent (actif)" : s & 0x08 ? "Intermittent / mémorisé" : s & 0x04 ? "En attente (sporadique)" : "Mémorisé",
  };
}
const STATUS_BITS = [
  ["active", "Défaut présent maintenant"], ["testFailedThisCycle", "Apparu pendant ce trajet"], ["pending", "En attente (pas encore confirmé)"],
  ["confirmed", "Confirmé / mémorisé"], ["notCompletedSinceClear", "Test pas encore refait depuis l'effacement"], ["failedSinceClear", "Apparu depuis le dernier effacement"],
  ["notCompletedThisCycle", "Test pas encore fait pendant ce trajet"], ["warning", "Allume un témoin au tableau de bord"],
];

const SESSIONS = { 1: "Normale", 2: "Programmation", 3: "Étendue (réglages)", 0x40: "Fin de ligne VW", 0x4f: "Développement VW" };

class Uds {
  constructor(elm, open) { this.elm = elm; this.open = open; }

  async did(m, did, quick) {
    await this.open(m, quick);
    try {
      const r = await this.elm.uds("22" + did, quick ? 1500 : 4000);
      if (r && r[0] === 0x62) return r.slice(3);
    } catch (e) { if (e.nrc === undefined) throw e; }
    return null;
  }

  // Fiche complète du calculateur
  async identification(m) {
    const out = [];
    for (const [did, name] of ID_DIDS) {
      const b = await this.did(m, did, true).catch(() => null);
      if (!b) continue;
      let text = ascii(b);
      if (did === "F186") text = SESSIONS[b[0]] || `0x${hx(b)}`;
      else if (did === "0600") text = hx(b);
      else if (!text) text = hx(b);
      out.push({ did, name, text, hex: hx(b) });
    }
    return out;
  }

  // Défauts détaillés : bits d'état + conditions d'apparition (environnement) + données étendues
  async dtcDetails(m, raw3) {
    await this.open(m);
    const dtc3 = raw3.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join("");
    const res = { snapshots: [], extended: [] };
    try {
      const r = await this.elm.uds("1904" + dtc3 + "FF", 6000);
      if (r && r[0] === 0x59) {
        res.status = statusInfo(r[5]);
        let i = 6;
        while (i < r.length) {
          const rec = r[i], n = r[i + 1];
          const start = i + 2;
          // sans le fichier constructeur, la longueur de chaque valeur est inconnue :
          // un seul identifiant → toutes les données lui appartiennent
          let end = r.length;
          for (let j = start + 3; j < r.length - 1; j++) if (r[j] === rec + 1 && j > start) { end = j; break; }
          const body = r.slice(start, end);
          const items = [];
          if (n === 1 && body.length >= 2) {
            const did = h4((body[0] << 8) | body[1]);
            items.push({ did, name: DID_NAMES[did] || null, ...interpret(body.slice(2)) });
          } else if (body.length >= 2) {
            items.push({ did: h4((body[0] << 8) | body[1]), name: `${n} valeurs enregistrées (données brutes)`, ...interpret(body.slice(2)) });
          }
          res.snapshots.push({ record: rec, count: n, items });
          i = end;
          if (end === r.length) break;
        }
      }
    } catch (e) { res.snapErr = e.nrc !== undefined ? nrcText(e.nrc) : e.message; }
    try {
      const r = await this.elm.uds("1906" + dtc3 + "FF", 6000);
      if (r && r[0] === 0x59) {
        res.status = res.status || statusInfo(r[5]);
        const d = r.slice(6);
        // format courant : n° d'enregistrement puis données (longueur propre au constructeur)
        if (d.length) {
          const rec = d[0], body = d.slice(1);
          res.extended.push({ record: rec, ...interpret(body), first: body[0] });
        }
      }
    } catch (e) { res.extErr = e.nrc !== undefined ? nrcText(e.nrc) : e.message; }
    res.statusBits = res.status ? STATUS_BITS.map(([k, label]) => ({ label, on: res.status[k] })) : [];
    return res;
  }

  // Tous les défauts y compris ceux sans état « confirmé » (masque complet)
  async allDtcs(m) {
    await this.open(m);
    const r = await this.elm.uds("1902FF", 8000);
    if (!r || r[0] !== 0x59) return [];
    const out = [];
    for (let i = 3; i + 3 < r.length; i += 4) {
      const [a, b, c, s] = r.slice(i, i + 4);
      if (!a && !b && !c) continue;
      const code = dtcCode(a, b);
      out.push({ code: `${code} ${c.toString(16).toUpperCase().padStart(2, "0")}`, base: code, raw3: [a, b, c], ftbText: ftbText(c), status: statusInfo(s), ...describeDtc(code) });
    }
    return out;
  }

  // ---- Codage long ----
  async readCoding(m) {
    const b = await this.did(m, "0600");
    if (!b) throw new Error("Ce calculateur ne donne pas de codage long (DID 0600).");
    return b;
  }

  async session(m, s) {
    await this.open(m);
    const r = await this.elm.uds("10" + s.toString(16).padStart(2, "0").toUpperCase(), 4000);
    if (!r || r[0] !== 0x50) throw new Error("Le calculateur n'a pas changé de session.");
    return SESSIONS[s] || s;
  }

  // Accès sécurisé (« login ») : méthode classique clé = graine + code
  async login(m, code, level = 3) {
    await this.open(m);
    await this.elm.uds("1003", 4000);
    const L = level.toString(16).padStart(2, "0").toUpperCase();
    const r = await this.elm.uds("27" + L, 4000);
    if (!r || r[0] !== 0x67) throw new Error("Pas de réponse à la demande d'accès.");
    const seed = r.slice(2);
    if (seed.every((x) => x === 0)) return "déjà déverrouillé";
    let s = 0; for (const b of seed) s = (s * 256 + b) >>> 0;
    const key = (s + (Number(code) >>> 0)) >>> 0;
    const kb = [];
    for (let i = seed.length - 1; i >= 0; i--) kb.unshift((key >>> ((seed.length - 1 - i) * 8)) & 0xff);
    const r2 = await this.elm.uds("27" + (level + 1).toString(16).padStart(2, "0").toUpperCase() + hx(kb).replace(/ /g, ""), 4000);
    if (!r2 || r2[0] !== 0x67) throw new Error("Code d'accès refusé.");
    return "déverrouillé";
  }

  async writeDid(m, did, bytes, opts = {}) {
    await this.open(m);
    if (opts.login) await this.login(m, opts.login, opts.level || 3);
    else await this.elm.uds("1003", 4000);
    const hex = "2E" + did + hx(bytes).replace(/ /g, "");
    const r = await this.elm.uds(hex, 10000);
    if (!r || r[0] !== 0x6e) throw new Error("Le calculateur n'a pas confirmé l'écriture.");
    return true;
  }

  // ---- Exploration de toutes les valeurs ----
  async scanDids(m, from, to, onProgress = () => {}, isCancelled = () => false) {
    const found = [];
    await this.open(m, true);
    for (let d = from; d <= to; d++) {
      if (isCancelled()) break;
      if ((d & 0x0f) === 0) onProgress((d - from) / (to - from + 1), h4(d), found.length);
      const did = h4(d);
      let r = null;
      try { r = await this.elm.uds("22" + did, 1500); } catch (e) { if (e.nrc === undefined) { await this.open(m, true); } continue; }
      if (r && r[0] === 0x62) {
        const b = r.slice(3);
        found.push({ did, name: DID_NAMES[did] || null, ...interpret(b) });
      }
    }
    onProgress(1, "", found.length);
    return found;
  }

  // Lecture rapide de plusieurs valeurs (jusqu'à 3 par requête si on connaît leurs longueurs)
  async readMany(m, list) {
    await this.open(m, true);
    const out = {};
    const known = list.filter((x) => x.len);
    for (let i = 0; i < known.length; i += 3) {
      const g = known.slice(i, i + 3);
      let r = null;
      try { r = await this.elm.uds("22" + g.map((x) => x.did).join(""), 2000); } catch {}
      if (r && r[0] === 0x62) {
        let p = 1, ok = true;
        for (const x of g) {
          const did = h4((r[p] << 8) | r[p + 1]);
          if (did !== x.did) { ok = false; break; }
          out[x.did] = interpret(r.slice(p + 2, p + 2 + x.len)); p += 2 + x.len;
        }
        if (ok) continue;
      }
      for (const x of g) { try { const b = await this.did(m, x.did, true); if (b) out[x.did] = interpret(b); } catch {} }
    }
    for (const x of list.filter((y) => !y.len)) { try { const b = await this.did(m, x.did, true); if (b) out[x.did] = interpret(b); } catch {} }
    return out;
  }

  async routine(m, id, sub = 1, data = "", extended = true) {
    await this.open(m);
    if (extended) await this.elm.uds("1003", 4000);
    const r = await this.elm.uds("31" + sub.toString(16).padStart(2, "0") + id + data, 15000);
    if (!r || r[0] !== 0x71) throw new Error("Pas de réponse à la routine.");
    return { result: hx(r.slice(4)), raw: hx(r) };
  }

  async reset(m, type = 1) {
    await this.open(m);
    const r = await this.elm.uds("11" + type.toString(16).padStart(2, "0"), 6000);
    return !!(r && r[0] === 0x51);
  }

  // Requête libre ; renvoie la réponse en hexadécimal (ou le refus expliqué)
  async raw(m, hex) {
    await this.open(m);
    try {
      const r = await this.elm.uds(hex.replace(/\s+/g, "").toUpperCase(), 10000);
      return r ? { ok: true, hex: hx(r), ascii: ascii(r.slice(3)) } : { ok: false, text: "Pas de réponse" };
    } catch (e) { return { ok: false, text: e.message }; }
  }
}

module.exports = { Uds, ID_DIDS, DID_NAMES, interpret, SESSIONS };
