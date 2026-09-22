/**
 * Para Kontrol — minik test kosucusu (harici bagimlilik yok).
 * Kullanim:
 *   const s = createSuite("core");
 *   s.ok("aciklama", kosul);
 *   s.eq("aciklama", gercek, beklenen);
 *   s.done();   // ozet yazar, basarisizlikta process.exitCode=1
 */
function createSuite(file) {
  const results = [];
  function rec(name, pass, extra) {
    results.push({ name, pass: !!pass, extra: extra === undefined ? "" : String(extra) });
  }
  return {
    file,
    ok(name, cond, extra) { rec(name, cond, extra); },
    eq(name, actual, expected) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      rec(name, a === b, a === b ? "" : "beklenen=" + b + " gelen=" + a);
    },
    true(name, v) { rec(name, v === true, "gelen=" + JSON.stringify(v)); },
    throws(name, fn, re) {
      try { fn(); rec(name, false, "hata bekleniyordu ama firlatilmadi"); }
      catch (e) { rec(name, !re || re.test(String(e && e.message || e)), "mesaj=" + (e && e.message)); }
    },
    results() { return results.slice(); },
    done() {
      const pass = results.filter((r) => r.pass).length;
      results.forEach((r) => {
        console.log((r.pass ? "PASS" : "FAIL") + " | " + r.name + (r.pass || !r.extra ? "" : "   [" + r.extra + "]"));
      });
      console.log("");
      const mark = pass === results.length ? "ALL PASS" : "FAIL";
      console.log("== " + file + ": " + mark + "  " + pass + "/" + results.length);
      /* jsdom pencereleri/zamanlayicilari dongu sonrasi acik kalabilir: acikca cik. */
      process.exit(pass === results.length ? 0 : 1);
    },
  };
}
module.exports = { createSuite };
