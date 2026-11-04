const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  await d.connect({ type: "demo" });
  const eng = d.vagModules().find((m) => m.addr === "01");
  assert.equal((await d.vagScanModule(eng)).dtcs.length, 3);
  // le moteur simulé refuse l'effacement constructeur (0x11) comme le Crafter réel : repli OBD mode 04
  assert.equal(await d.vagClear(eng), true);
  assert.equal((await d.vagScanModule(eng)).dtcs.length, 0);
  console.log("CLEAR OK"); await d.disconnect();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
