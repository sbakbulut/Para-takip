/**
 * tests/run.js — tum test dosyalarini sirayla calistirir ve toplami yazar.
 *   node tests/run.js      (npm test)
 */
const { spawnSync } = require("child_process");
const path = require("path");

const FILES = ["test.js", "test-sync.js", "test-jev.js"];
let pass = 0, fail = 0, failedFiles = [];

for (const f of FILES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out);
  const m = out.match(/== ([^:]+): (ALL PASS|FAIL)\s+(\d+)\/(\d+)/);
  if (m) { pass += Number(m[3]); fail += Number(m[4]) - Number(m[3]); }
  if (r.status !== 0) failedFiles.push(f);
}

console.log("");
if (failedFiles.length === 0) {
  console.log("TAMAMI GECTI — " + pass + " kontrol, 0 hata");
} else {
  console.log("BASARISIZ — " + pass + " gecti, " + fail + " basarisiz | dosyalar: " + failedFiles.join(", "));
}
process.exit(failedFiles.length === 0 ? 0 : 1);
