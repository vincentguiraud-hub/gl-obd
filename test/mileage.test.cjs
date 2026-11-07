const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  await d.connect({ type: "demo" });
  const mods = d.vagModules();
  const eng = mods.find((m) => m.addr === "01"), kombi = mods.find((m) => m.addr === "17");
  const t0 = Date.now();
  const res = await d.checkMileage([{ ...eng, partNumber: "04L907309R" }, { ...kombi, partNumber: "7C0920740B" }], 148421, [[0x2000, 0x22ff], [0x2900, 0x29ff]], {}, () => {});
  console.log("KM", Date.now() - t0, "ms", JSON.stringify(res));
  assert.equal(Math.round(res.obd), 148421);
  assert.ok(res.modules[0].matches.find((x) => x.did === "295A" && Math.abs(x.diff) < 10));
  // base constructeur : sources de kilométrage connues
  const id = d.oemGuess(); const odo = d.oemOdometers(id, 2019);
  const vals = await d.oemRead(id, 2019, [...new Set(odo.map((o) => o.key))]);
  console.log("OEM ODO", JSON.stringify(vals));
  assert.equal(vals["7E0:22295A"].CRAFTER_ODO.value, 148416);
  assert.ok(Object.values(vals["714:222203"]).some((x) => x.value === 148421));
  assert.ok(res.modules[1].matches.find((x) => x.did === "2203" && x.diff === 0));
  let err = ""; try { await d.atelier("writeDid", kombi, "2203", [0, 0, 1]); } catch (e) { err = e.message; }
  assert.ok(/kilométrage/.test(err), err);
  // valeurs déjà connues : lecture directe
  const res2 = await d.checkMileage([{ ...kombi, partNumber: "7C0920740B" }], 150000, [], { "7C0920740B": [{ did: "2203", scale: 1 }] });
  assert.equal(res2.modules[0].knownValues[0].km, 148421);
  // scan multi-numéros : mêmes résultats que l'ancien scan
  const sc = await d.scanDids(eng, 0x1000, 0x10ff, () => {});
  assert.equal(sc.length, 8);
  console.log("MILEAGE OK"); await d.disconnect();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
