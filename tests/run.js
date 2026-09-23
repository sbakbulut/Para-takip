/**
 * tests/run.js — tum test dosyalarini sirayla calistirir ve toplami yazar.
 *   node tests/run.js      (npm test)
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { runOne } = require("./runner-lib");

const FILES = ["test.js", "test-sync.js", "test-jev.js", "test-runner.js"];
let pass = 0, fail = 0, failedFiles = [];

for (const f of FILES) {
  const result = runOne(f, (file) => spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: "utf8" }));
  const out = result.output || "";
  process.stdout.write(out);
  if (result.summary) {
    pass += result.summary.passed;
    fail += result.summary.total - result.summary.passed;
  }
  if (!result.ok) {
    failedFiles.push(f);
    console.error(`RUNNER HATASI — ${result.message}`);
  }
}

console.log("");
if (failedFiles.length === 0) {
  console.log("TAMAMI GECTI — " + pass + " kontrol, 0 hata");
} else {
  console.log("BASARISIZ — " + pass + " gecti, " + fail + " basarisiz | dosyalar: " + failedFiles.join(", "));
}
process.exit(failedFiles.length === 0 ? 0 : 1);
