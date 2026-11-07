// Base de données constructeur communautaire OBDb (https://github.com/OBDb – licence CC BY-SA 4.0)
// 640+ véhicules, 240 000+ valeurs nommées avec leur échelle (moteur, boîte, batterie, pneus, kilométrage…).
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DIR = path.join(__dirname, "..", "..", "data", "obdb");
let INDEX = null;
const CACHE = new Map();

function index() {
  if (!INDEX) INDEX = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  return INDEX;
}

// Commandes d'un véhicule (+ commandes communes à la marque), filtrées par année modèle
function load(id, year) {
  const key = id + ":" + (year || "");
  if (CACHE.has(key)) return CACHE.get(key);
  const read = (x) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, x + ".json.gz"))).toString("utf8")); } catch { return []; } };
  const make = id.split("-")[0];
  const own = read(id);
  const seen = new Set(own.map((c) => c.h + c.s + c.d));
  const all = [...own, ...(make !== id ? read(make).filter((c) => !seen.has(c.h + c.s + c.d)) : [])];
  const ok = (f) => !f || !year || ((!f.from || year >= f.from) && (!f.to || year <= f.to) && (!f.years || f.years.includes(year)));
  const cmds = all.filter((c) => ok(c.f)).map((c) => ({
    hdr: c.h, rax: c.r || defaultRax(c.h), svc: c.s, did: c.d,
    signals: c.x.map(([sid, name, cat, bix, len, sign, blsb, mul, div, add, unit, map, nmin, nmax, min, max]) => ({ id: sid, name, cat, bix, len, sign, blsb, mul, div, add, unit, map, nmin, nmax, min, max })),
  }));
  CACHE.set(key, cmds);
  return cmds;
}

// Réponse habituelle : +8 pour 7E0–7E7, +0x6A pour les calculateurs VW 7xx, 29 bits : DAxx -> F1xx
function defaultRax(h) {
  if (h.length === 4) return h;
  const n = parseInt(h, 16);
  return (n >= 0x7e0 && n <= 0x7e7 ? n + 8 : n + 0x6a).toString(16).toUpperCase();
}

function bits(data, bix, len, blsb) {
  if (blsb) {
    let v = 0n; const start = bix >> 3, n = Math.ceil(len / 8);
    for (let i = n - 1; i >= 0; i--) { if (start + i >= data.length) return null; v = (v << 8n) | BigInt(data[start + i]); }
    return v & ((1n << BigInt(len)) - 1n);
  }
  let v = 0n;
  for (let i = 0; i < len; i++) {
    const b = bix + i, byte = b >> 3;
    if (byte >= data.length) return null;
    v = (v << 1n) | BigInt((data[byte] >> (7 - (b & 7))) & 1);
  }
  return v;
}

// data = octets après l'écho du service et du numéro (ex. après 62 F4 31)
function decode(sig, data) {
  let r = bits(data, sig.bix, sig.len, sig.blsb);
  if (r === null) return null;
  if (sig.sign && (r >> BigInt(sig.len - 1)) & 1n) r -= 1n << BigInt(sig.len);
  const raw = Number(r);
  if (sig.map) return { value: raw, text: sig.map[String(raw)] ?? null };
  let value = (raw * sig.mul) / sig.div + sig.add;
  // valeurs réservées = « pas de donnée »
  if ((sig.nmin != null && value <= sig.nmin && sig.nmin !== sig.min) || (sig.nmax != null && value >= sig.nmax && sig.nmax !== sig.max)) return { value: null };
  if (sig.max != null && value > sig.max) value = sig.max;
  if (sig.min != null && value < sig.min) value = sig.min;
  return { value };
}

// Choix automatique du véhicule dans la base à partir du VIN / de la marque
function guess(brand, vin, year) {
  const idx = index();
  const mk = (brand || "").split(" ")[0].replace("Škoda", "Skoda");
  const cands = idx.filter((x) => x.make.toLowerCase() === mk.toLowerCase());
  // VW utilitaires : 7e-8e caractères du VIN = code du modèle
  const vwModel = vin && /^WV[12]/.test(vin) ? { SY: "Crafter", SZ: "Crafter", "2E": "Crafter", SH: "Transporter", SG: "Transporter", "7H": "Transporter", "7J": "Transporter", "2H": "Amarok", SK: "Caddy" }[vin.slice(6, 8)] : null;
  if (vwModel) { const m = cands.find((x) => x.model === vwModel); if (m) return m.id; }
  return cands.find((x) => !x.model)?.id || cands[0]?.id || null;
}

const UNITS = { celsius: "°C", kilometers: "km", kilometersPerHour: "km/h", percent: "%", volts: "V", amps: "A", ampereHours: "Ah", bars: "bar", kilopascal: "kPa",
  rpm: "tr/min", seconds: "s", minutes: "min", hours: "h", kilowatts: "kW", kilowattHours: "kWh", newtonMeters: "Nm", liters: "L", milliliters: "mL",
  litersPerHour: "L/h", gramsPerSecond: "g/s", milligramsPerStroke: "mg/coup", degrees: "°", ohms: "Ω", kilograms: "kg", grams: "g", meters: "m",
  millimeters: "mm", scalar: "", milliseconds: "ms", millivolts: "mV", milliamps: "mA", watts: "W", days: "j", hertz: "Hz", pascal: "Pa",
  milesPerHour: "mph", miles: "mi", psi: "psi", fahrenheit: "°F", yesno: "", offon: "", unknown: "" };
const CATS = { Engine: "Moteur", Battery: "Batterie", Tires: "Pneus", Trips: "Trajets", Transmission: "Boîte de vitesses", DTCs: "Défauts", Fuel: "Carburant",
  Climate: "Climatisation", Brakes: "Freins", Doors: "Portes", Lights: "Éclairage", Movement: "Déplacement", Emissions: "Antipollution", Electrical: "Électricité",
  Charging: "Recharge", Control: "Commandes", Steering: "Direction", Suspension: "Suspension", Cluster: "Combiné", Airbag: "Airbags", Seats: "Sièges", ADAS: "Aides à la conduite",
  Body: "Carrosserie", HVAC: "Climatisation", Infotainment: "Multimédia", Gearbox: "Boîte de vitesses", Oil: "Huile", Cooling: "Refroidissement", Turbo: "Turbo", Exhaust: "Échappement", DPF: "FAP" };
const unitFr = (u) => UNITS[u] ?? u;
const catFr = (c) => (c || "").split(".").map((x) => CATS[x] || x).join(" › ");

module.exports = { index, load, decode, guess, unitFr, catFr, bits };
