const assert = require("assert");
const { runOne, parseSummary } = require("./runner-lib");

const failedSpawn = runOne("test.js", () => ({
  error: Object.assign(new Error("spawn blocked"), { code: "EPERM" }),
  status: 0,
  stdout: "",
  stderr: "",
}));

assert.strictEqual(failedSpawn.ok, false, "alt süreç başlatma hatası başarısız sayılmalı");
assert.match(failedSpawn.message, /EPERM/);

assert.deepStrictEqual(
  parseSummary("== test.js: ALL PASS  85/85"),
  { passed: 85, total: 85 },
  "test özeti doğru ayrıştırılmalı",
);

console.log("== test-runner.js: ALL PASS  2/2");
