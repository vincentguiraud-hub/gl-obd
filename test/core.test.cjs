const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  let n = 0; d.on("log", () => n++);
  const info = await d.connect({ type: "demo" });
  console.log("INFO", info);
  assert.equal(info.vin, "WV1ZZZSYZK9012345"); assert.equal(info.year, 2019); assert.ok(info.vag);
  const dt = await d.readDtcs(); console.log("DTC", JSON.stringify(dt));
  assert.deepEqual(dt.stored.map(x=>x.code), ["P0299","P2463"]);
  const sp = await d.supportedPids(); console.log("PIDS", sp.length, sp.map(p=>p.pid.toString(16)).join(","));
  await new Promise(r=>setTimeout(r,500));
  const v = await d.readPids(sp.map(p=>p.pid)); console.log("VALS", v);
  assert.ok(v[0x0c] !== undefined && v[0xa6] === 148421);
  const rd = await d.readiness(); console.log("READY", JSON.stringify(rd));
  const ff = await d.freezeFrame(); console.log("FF", ff.dtc, ff.values.length);
  const mods = d.vagModules();
  for (const m of mods) { const r = await d.vagScanModule(m); console.log("MOD", m.addr, r.reachable, r.systemName, r.partNumber, (r.dtcs||[]).map(x=>x.code+" "+x.status.label+" "+(x.description||x.category)+" / "+x.ftbText).join("; "), r.error||""); }
  const bcm = mods.find(m=>m.addr==="09");
  console.log("clear BCM", await d.vagClear(bcm));
  const r2 = await d.vagScanModule(bcm); assert.equal(r2.dtcs.length, 0);
  // retour OBD après VAG
  const dt2 = await d.readDtcs(); assert.equal(dt2.stored.length, 2);
  const t0=Date.now(); const found = await d.vagDiscover(()=>{}); console.log("DISCOVER", Date.now()-t0, "ms", found.map(f=>f.reqHex+" "+f.name));
  assert.ok(found.find(f=>f.reqHex==="74F"));
  await d.clearDtcs(); const dt3 = await d.readDtcs(); assert.equal(dt3.stored.length, 0);
  console.log("raw", await d.raw("ATI"));
  console.log("OK, log lines", n);
  await d.disconnect();
})().catch(e => { console.error("FAIL", e); process.exit(1); });
