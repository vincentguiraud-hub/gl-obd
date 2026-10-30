const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  const info = await d.connect({ type: "demo", vehicle: "truck" });
  console.log("INFO", info);
  assert.equal(info.vin, "WMA06XZZ9KP012345"); assert.equal(info.brand, "MAN");
  const dt = await d.readDtcs(); console.log("DTC", dt.stored.map(x => x.code + " " + x.description + " @" + x.ecu), "| prev", dt.previous.map(x=>x.code+" "+x.description), dt.lamps);
  assert.equal(dt.stored.length, 3); assert.equal(dt.previous.length, 1);
  const params = await d.supportedPids();
  const v = await d.readPids(params.map(p => p.pid)); console.log("LIVE", v);
  assert.ok(v[1001] > 0 && v[1015] === 612480 && Math.abs(v[1009]-27.6)<0.01);
  for (const m of d.vagModules()) { const r = await d.vagScanModule(m); if (r.reachable) console.log("MOD", m.addr, r.systemName, r.partNumber, r.software, r.dtcs.map(x=>x.code+" "+(x.description||x.category)+" ["+x.status.label+"]").join("; ")); }
  const eng = d.vagModules()[0]; await d.vagClear(eng); assert.equal((await d.vagScanModule(eng)).dtcs.length, 0);
  await d.clearDtcs(); const dt2 = await d.readDtcs(); assert.equal(dt2.stored.length + dt2.previous.length, 0);
  const t0 = Date.now(); const f = await d.vagDiscover(() => {}); console.log("DISCOVER", Date.now()-t0, f.map(x=>x.addr+" "+x.name));
  assert.equal(f.length, 5);
  console.log("TRUCK OK"); await d.disconnect();
})().catch(e => { console.error("FAIL", e); process.exit(1); });
