"use strict";
// Banc de puissance : boîte automatique (passages de rapport pied à fond) et boîte manuelle
const assert = require("assert");
const { PerfTrack, curve } = require("../renderer/perfcalc.js");

function run(gears, pedalD, releaseAt) {
  const tr = new PerfTrack(); let ms = 0, v = 20, done = false;
  for (const [r0, r1, ratio] of gears) {
    for (let rpm = r0; rpm <= r1; rpm += 150) {
      v = rpm / ratio; ms += 120;
      tr.push({ ms, rpm, v, pedal: pedalD, t: 300, p: (300 * rpm) / 9549 });
      if (tr.done()) { done = true; break; }
    }
    if (done) break;
  }
  if (!done && releaseAt) for (let i = 0; i < 3 && !done; i++) { ms += 120; tr.push({ ms, rpm: 2500, v, pedal: 10, t: 0, p: 0 }); done = tr.done(); }
  return { tr, done };
}
// boîte auto (Q3 2.0 TDI) : 1re 1600→4300, 2e 2900→4300, 3e 3000→4300 ; pédale D qui plafonne à 78 %
const auto = run([[1600, 4300, 40], [2900, 4300, 24], [3000, 4300, 16]], 78, true);
assert.equal(auto.tr.shifts, 2, "2 passages de rapport détectés");
assert.ok(auto.done, "fin quand le pied est relâché");
assert.ok(auto.tr.samples.some((s) => s.gear === 3 && s.pedal === 78), "la mesure ne s'arrête pas au premier passage de rapport");
const c = curve(auto.tr.samples);
assert.ok(c[0].rpm <= 1700 && c[c.length - 1].rpm >= 4200, "la courbe couvre toute la plage de régime");
assert.ok(!auto.tr.samples.filter((s) => s.shift).some((s) => c.find((b) => b.ms === s.ms)), "instants de changement écartés");
// sans capteur de pédale : la mesure continue après un passage de rapport, s'arrête quand la vitesse baisse
const nopedal = run([[1600, 4300, 40], [2900, 4300, 24]], null, false);
assert.equal(nopedal.tr.shifts, 1); assert.ok(!nopedal.done);
let ms = nopedal.tr.samples.at(-1).ms; for (let i = 0; i < 3; i++) nopedal.tr.push({ ms: (ms += 120), rpm: 2000, v: 160 - i * 5, pedal: null });
assert.ok(nopedal.tr.done(), "fin quand le véhicule ralentit");
// boîte manuelle, un seul rapport : toujours fonctionnel
const man = run([[1200, 4500, 30]], 100, true);
assert.equal(man.tr.shifts, 0); assert.ok(man.done);
console.log("PERF OK");
