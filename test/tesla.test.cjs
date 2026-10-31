const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  const info = await d.connect({ type: "demo", vehicle: "tesla" });
  console.log("INFO", info); assert.equal(info.vin, "LRWYGCEK1RC012345"); assert.equal(info.model, "Model Y");
  let s; for (let i = 0; i < 2; i++) s = await d.teslaPoll();
  console.log("SUM", s);
  assert.ok(Math.abs(s.fullPack - 74.6) < 0.01 && Math.abs(s.health - 94.67) < 0.1 && s.cells && s.cells.count > 30 && Math.abs(s.charged - 6123.456) < 0.01);
  const all = await d.teslaAll(800); console.log("ALL", all.length, all.slice(0, 2).map(m => m.name + " " + m.signals.length));
  let err = ""; try { await d.readDtcs(); } catch (e) { err = e.message; } assert.ok(err.includes("Tesla"));
  const sn = await d.sniff(300); assert.ok(sn.length > 10);
  console.log("TESLA OK"); await d.disconnect();
})().catch(e => { console.error("FAIL", e); process.exit(1); });
