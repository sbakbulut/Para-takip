function parseSummary(output) {
  const match = output.match(/== [^:]+: (?:ALL PASS|FAIL)\s+(\d+)\/(\d+)/);
  return match ? { passed: Number(match[1]), total: Number(match[2]) } : null;
}

function runOne(file, spawn) {
  const result = spawn(file);
  if (result.error) {
    return { ok: false, message: `${file}: ${result.error.code || result.error.message}` };
  }

  const output = (result.stdout || "") + (result.stderr || "");
  const summary = parseSummary(output);
  if (result.status !== 0) {
    return { ok: false, message: `${file}: exit ${result.status}`, output, summary };
  }
  if (!summary) {
    return { ok: false, message: `${file}: test özeti bulunamadı`, output };
  }
  return { ok: true, output, summary };
}

module.exports = { runOne, parseSummary };
