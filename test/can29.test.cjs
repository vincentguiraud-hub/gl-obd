const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
const dtc = require("../src/core/dtc.cjs");
(async () => {
  const d = new Diag();
  await d.connect({ type: "demo" });
  d.vag.generic = true; // comme une marque hors groupe VW
  const found = await d.vagDiscover(() => {});
  const m29 = found.find((f) => f.ext);
  console.log("29 bits :", m29);
  assert.ok(m29 && m29.addr === "DA28");
  const id = await d.atelier("identification", m29);
  assert.ok(id.find((x) => x.text === "Body Control 29bit"));
  assert.equal((await d.atelier("did", m29, "1234")).u16, 500);
  // retour en 11 bits ensuite
  d.vag.generic = false;
  const eng = d.vagModules().find((m) => m.addr === "01");
  assert.ok((await d.vagScanModule(eng)).reachable);
  // libellés anglais complets
  dtc.setBrand("Volkswagen");
  assert.equal(dtc.describeDtc("P0597").lang, "en");
  console.log("CAN29 OK"); await d.disconnect();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
