const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  await d.connect({ type: "demo" });
  const mods = d.vagModules(); const eng = mods[0], bcm = mods.find(m => m.addr === "09");
  const id = await d.atelier("identification", eng); console.log("ID", id.map(x => x.name + "=" + x.text).join(" | "));
  assert.ok(id.find(x => x.did === "F19E"));
  const dt = await d.atelier("allDtcs", eng); console.log("DTC", dt.map(x => x.code));
  const det = await d.atelier("dtcDetails", eng, dt[0].raw3); console.log("DET", JSON.stringify(det));
  assert.ok(det.snapshots.length && det.extended.length);
  const cod = await d.atelier("readCoding", bcm); console.log("COD", cod.length);
  // écriture refusée sans code
  let refused = false; try { await d.atelier("writeDid", bcm, "0600", cod.map((x,i)=> i===0 ? x^1 : x)); } catch (e) { refused = true; console.log("refus:", e.message); }
  assert.ok(refused);
  await d.atelier("writeDid", bcm, "0600", cod.map((x,i)=> i===0 ? x^1 : x), { login: 31347 });
  const cod2 = await d.atelier("readCoding", bcm); assert.equal(cod2[0], cod[0]^1); console.log("coding long write OK (30 octets multi-trames)");
  const t0 = Date.now(); const sc = await d.scanDids(eng, 0x1000, 0x10FF, ()=>{}); console.log("SCAN", Date.now()-t0, "ms", sc.map(x => x.did + ":" + x.hex));
  assert.equal(sc.length, 8);
  const many = await d.atelier("readMany", eng, sc.map(x => ({ did: x.did, len: x.len }))); console.log("MANY", Object.keys(many).length);
  assert.equal(Object.keys(many).length, 8);
  await d.atelier("writeDid", eng, "1005", [70]); assert.equal((await d.atelier("did", eng, "1005")).u8, 70);
  console.log("ROUT", await d.atelier("routine", eng, "0183", 1, ""));
  console.log("RAW", await d.atelier("raw", eng, "22F187"), await d.atelier("raw", eng, "2EF187"));
  const m6 = await d.mode06(); console.log("M06", m6.length, m6.filter(x => !x.pass).map(x => x.name + " " + x.value + "/" + x.min + "-" + x.max));
  assert.ok(m6.length >= 10);
  const m9 = await d.mode09(); console.log("M09", JSON.stringify(m9).slice(0, 300));
  const sn = await d.sniff(400); console.log("SNIFF", sn.length, sn.slice(0,3));
  assert.ok(sn.length > 10);
  const dt2 = await d.readDtcs(); assert.equal(dt2.stored.length, 2); // retour OBD après sniff
  await d.disconnect();
  // camion
  await d.connect({ type: "demo", vehicle: "truck" });
  const te = d.vagModules()[0];
  console.log("TID", (await d.atelier("identification", te)).map(x => x.text).join(","));
  const tdt = await d.atelier("allDtcs", te); console.log("TDT", tdt.length);
  console.log("TCOD", (await d.atelier("readCoding", te)).length);
  const ts = await d.sniff(400); console.log("TSNIFF", ts.length, ts[0]);
  assert.ok(ts.length > 3);
  console.log("ATELIER OK"); await d.disconnect();
})().catch(e => { console.error("FAIL", e); process.exit(1); });
