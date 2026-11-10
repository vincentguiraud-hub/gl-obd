const assert = require("assert");
const { Diag } = require("../src/core/diag.cjs");
(async () => {
  const d = new Diag();
  await d.connect({ type: "demo" });
  const r = await d.tuneCheck();
  console.log(JSON.stringify(r).slice(0, 600));
  assert.equal(r.calids[0].text.replace(/\s+/g, " "), "04L907309R 0003");
  assert.equal(r.cvns[0].hex, "8A3F11C2");
  assert.equal(r.fingerprint.date, "12/03/2020");
  assert.ok(r.ids.F189 && r.ids.F199);
  console.log("TUNE OK"); await d.disconnect();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
