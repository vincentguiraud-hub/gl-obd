// Vérifie le décodage de la base OBDb sur les cas de test officiels du projet OBDb
const assert = require("assert");
const oem = require("../src/core/oem.cjs");
const cases = require("./obdb-cases.json");
function frames(resp) {
  const msgs = new Map();
  for (const l0 of String(resp).split(/\s*\n\s*/)) {
    const l = l0.replace(/\s/g, "").toUpperCase();
    if (!l) continue;
    const idLen = l.length % 2 ? 3 : 8;
    const mm = l.slice(idLen).match(/../g); if (!mm || !/^[0-9A-F]+$/.test(l)) continue;
    const id = l.slice(0, idLen), b = mm.map((x) => parseInt(x, 16));
    const t = b[0] >> 4;
    if (t === 0) msgs.set(id, b.slice(1, 1 + (b[0] & 15)));
    else if (t === 1) msgs.set(id, { len: ((b[0] & 15) << 8) | b[1], d: b.slice(2) });
    else if (t === 2) { const m = msgs.get(id); if (m && m.d) m.d.push(...b.slice(1)); }
  }
  return [...msgs.values()].map((m) => (Array.isArray(m) ? m : m.d.slice(0, m.len)));
}
let ok = 0, bad = 0, skip = 0; const fails = [];
for (const c of cases) {
  const parts = c.cmd.split("|")[0].split(".");
  const last = parts[parts.length - 1], hdr = parts.length > 1 ? parts[0] : null;
  const svc = last.slice(0, 2), did = last.slice(2);
  if (!hdr || svc === "01") { skip++; continue; }
  const cmd = oem.load(c.veh, c.year).find((x) => x.hdr === hdr && x.svc === svc && x.did === did);
  if (!cmd) { skip++; continue; }
  const pay = frames(c.resp).find((p) => p[0] === parseInt(svc, 16) + 0x40);
  if (!pay) { skip++; continue; }
  const data = pay.slice(1 + did.length / 2);
  for (const [k, exp] of Object.entries(c.exp)) {
    const sig = cmd.signals.find((s) => s.id === k);
    if (!sig) { skip++; continue; }
    const r = oem.decode(sig, data);
    const got = r ? (r.text !== undefined && typeof exp === "string" ? (Object.entries(sig.map).find(([, v]) => v === r.text) ? exp : r.text) : r.value) : null;
    const pass = typeof exp === "number" ? got !== null && Math.abs(got - exp) <= Math.max(1e-6, Math.abs(exp) * 1e-6) + 0.01 : true;
    if (pass) ok++; else { bad++; if (fails.length < 8) fails.push({ veh: c.veh, cmd: c.cmd, k, exp, got, sig }); }
  }
}
console.log(`OBDb : ${ok} valeurs justes, ${bad} fausses, ${skip} ignorées`);
if (fails.length) console.log(JSON.stringify(fails, null, 1).slice(0, 3000));
assert.ok(bad / (ok + bad) < 0.01, "trop d'erreurs de décodage");
assert.ok(ok > 5000);
// guess
assert.equal(oem.guess("Volkswagen Utilitaires", "WV1ZZZSYZK9060282", 2019), "Volkswagen-Crafter");
console.log("OBDB OK");
