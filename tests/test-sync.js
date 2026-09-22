/**
 * test-sync.js — Drive senkronizasyonu.
 *
 * Iki katman sinanir:
 *  1) SUNUCU: gas/Code.gs gercekten calistirilir (vm + Apps Script taklidi).
 *     Token dogrulama, action beyaz listesi, hiz/boyut limiti, POST-only
 *     kurali ve Jev proxy'sinin SSRF kapali beyaz listesi burada dogrulanir.
 *  2) ISTEMCI: index.html'deki protokol fonksiyonlari (drivePost/driveBody).
 *     Token'in YALNIZCA govdede gitmesi, URL'e hicbir zaman girmemesi.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createSuite } = require("./tiny");
const { boot } = require("./harness");

const s = createSuite("test-sync.js");
const GAS = fs.readFileSync(path.join(__dirname, "..", "gas", "Code.gs"), "utf8");

/* ---- Apps Script ortamini taklit et ve Code.gs'i GERCEKTEN calistir ---- */
function loadProxy(opts = {}) {
  const store = Object.assign({}, opts.properties || {});
  const calls = [];
  const sandbox = {
    console,
    Date, JSON, Math, Object, String, Number, Array, RegExp, Error, Boolean,
    isFinite, isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
      }),
    },
    Logger: { log: () => {} },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; }, getContent() { return t; } }),
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        calls.push({ url, options: o });
        const up = opts.upstream ? opts.upstream(url, o, calls.length) : { code: 200, text: "{}" };
        return { getResponseCode: () => up.code, getContentText: () => up.text };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(GAS, sandbox);
  return {
    store, calls,
    setToken: (t) => vm.runInContext("setToken", sandbox)(t),
    doGet: (e) => { const out = vm.runInContext("doGet", sandbox)(e);
      try { return JSON.parse(out.text); } catch (err) { return { _raw: out.text }; } },
    /* doPost + yanit metnini coz */
    post: (body) => {
      const e = { postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } };
      const out = vm.runInContext("doPost", sandbox)(e);
      let parsed = null;
      try { parsed = JSON.parse(out.text); } catch (err) { parsed = { _raw: out.text }; }
      return parsed;
    },
  };
}
const TOKEN = "gizli-kelime-1234567890";

/* ---------------- 1) Sunucu: kurulum ve token ---------------- */
{
  const p = loadProxy();
  s.throws("setToken: kisa token reddedilir", () => p.setToken("kisa"), /en az 16/i);
  p.setToken(TOKEN);
  s.ok("setToken: gecerli token kaydedilir", p.store.token === TOKEN);
}

/* ---------------- 2) POST-only kurali ---------------- */
{
  const p = loadProxy({ properties: { token: TOKEN } });
  s.eq("doGet her zaman reddeder (token URL'de tasinamaz)", p.doGet({ parameter: { token: TOKEN } }), { ok: false, error: "method_not_allowed", rev: "5" });
}

/* ---------------- 3) Token dogrulama ---------------- */
{
  const p = loadProxy();
  s.eq("token kurulmamis -> server_token_missing", p.post({ action: "ping", token: TOKEN }).error, "server_token_missing");
}
{
  const p = loadProxy({ properties: { token: TOKEN } });
  s.eq("yanlis token -> unauthorized", p.post({ action: "ping", token: "yanlis-token-000000" }).error, "unauthorized");
  s.eq("bos token -> unauthorized", p.post({ action: "ping" }).error, "unauthorized");
  const ok = p.post({ action: "ping", token: TOKEN });
  s.eq("dogru token -> ping ok", ok.ok, true);
  s.eq("ping sunucu rev bildirir", ok.rev, "5");
  s.eq("ping hasData=false (kayit yok)", ok.hasData, false);
}

/* ---------------- 4) Gecersiz istekler ---------------- */
{
  const p = loadProxy({ properties: { token: TOKEN } });
  s.eq("bozuk JSON -> bad_json", p.post("{bu json degil").error, "bad_json");
  s.eq("bilinmeyen action -> bad_action", p.post({ action: "sil", token: TOKEN }).error, "bad_action");
  s.eq("data string degil -> bad_data", p.post({ action: "put", token: TOKEN, data: { a: 1 } }).error, "bad_data");
  const big = { action: "put", token: TOKEN, data: "x".repeat(1000001) };
  s.eq("1 MB ustu govde -> too_large", p.post(big).error, "too_large");
}

/* ---------------- 5) put/get turu ---------------- */
{
  const p = loadProxy({ properties: { token: TOKEN } });
  const payload = JSON.stringify({ expenses: [{ id: "a", amount: 10, date: "2026-09-01", category: "market" }], _rev: 1 });
  const put = p.post({ action: "put", token: TOKEN, data: payload });
  s.eq("put ok", put.ok, true);
  s.eq("put bayt sayisi bildirir", put.bytes, payload.length);
  s.ok("put rev uretir", !!put.dataRev);
  const get = p.post({ action: "get", token: TOKEN });
  s.eq("get veriyi geri verir", get.data, payload);
  s.eq("get ayni rev'i bildirir", get.dataRev, put.dataRev);
  s.eq("kayit sonrasi ping hasData=true", p.post({ action: "ping", token: TOKEN }).hasData, true);
}

/* ---------------- 6) Hiz limiti (dakikada 60) ---------------- */
{
  const p = loadProxy({ properties: { token: TOKEN } });
  let limited = null, count = 0;
  for (let i = 0; i < 70; i++) {
    const r = p.post({ action: "ping", token: TOKEN });
    count++;
    if (r.error === "rate_limited") { limited = count; break; }
  }
  s.eq("61. istekte rate_limited", limited, 61);
}

/* ---------------- 7) Jev proxy'si: SSRF kapali beyaz liste ---------------- */
{
  const p = loadProxy({ properties: { token: TOKEN }, upstream: () => ({ code: 200, text: '{"model":"typesafe/jev-1.13","answers":{}}' }) });
  const base = { action: "jev", token: TOKEN, jevKey: "sk-or-v1-test", provider: "openrouter" };
  s.eq("jevKey yok -> jev_key_missing", p.post(Object.assign({}, base, { jevKey: "" })).error, "jev_key_missing");
  s.eq("request yok -> bad_request", p.post(Object.assign({}, base, { request: null })).error, "bad_request");
  s.eq("bilinmeyen provider -> bad_provider",
    p.post(Object.assign({}, base, { provider: "kotu", request: { model: "typesafe/jev-1.13", state: {}, questions: {} } })).error, "bad_provider");
  s.eq("model desen disi -> bad_model", p.post(Object.assign({}, base, { request: { model: "gpt-4o", state: {}, questions: {} } })).error, "bad_model");
  s.eq("yanlis token jev'de de gecerli degil", p.post(Object.assign({}, base, { token: "yanlis-token-000000", request: { model: "typesafe/jev-1.13" } })).error, "unauthorized");

  /* Istemci kendi URL'ini dayatsa bile sunucu sabit adrese gider */
  const req = { model: "typesafe/jev-1.13", state: { a: 1 }, questions: { q: { type: "noul" } } };
  const r = p.post(Object.assign({}, base, { request: req, url: "https://kotu.example/cal", endpoint: "https://kotu.example/cal" }));
  s.eq("istemcinin url/endpoint alani yok sayilir (SSRF kapali)", p.calls.length, 1);
  s.eq("yalnizca beyaz listedeki OpenRouter adresine cikilir", p.calls[0].url, "https://openrouter.ai/api/alpha/decisions");
  s.ok("jev ok doner", r.ok === true && typeof r.data === "string");
  s.ok("jev yaniti anahtari geri dondurmez", JSON.stringify(r).indexOf("sk-or-v1-test") === -1);

  /* TypeSafe saglayicisi */
  p.post(Object.assign({}, base, { provider: "typesafe", request: { model: "jev-latest", state: {}, questions: {} } }));
  s.eq("typesafe saglayicisi kendi adresine gider", p.calls[p.calls.length - 1].url, "https://api.typesafe.ai/v1/systemone");

  /* Surum toleransli model deseni */
  const rNew = p.post(Object.assign({}, base, { request: { model: "typesafe/jev-1.14", state: {}, questions: {} } }));
  s.ok("yeni surum slug'i proxy guncellenmeden calisir", rNew.ok === true);
}

/* ---------------- 8) Jev proxy'si: ust akis hatalari ---------------- */
{
  const cases = [[401, "unauthorized"], [403, "unauthorized"], [429, "rate_limited"], [402, "insufficient_credits"], [500, "upstream_500"]];
  for (const [code, err] of cases) {
    const p = loadProxy({ properties: { token: TOKEN }, upstream: () => ({ code, text: "upstream hata" }) });
    const r = p.post({ action: "jev", token: TOKEN, jevKey: "k", provider: "openrouter", request: { model: "typesafe/jev-1.13", state: {}, questions: {} } });
    s.eq("ust akis " + code + " -> " + err, r.error, err);
  }
  const p = loadProxy({ properties: { token: TOKEN }, upstream: () => { throw new Error("ag yok"); } });
  const r = p.post({ action: "jev", token: TOKEN, jevKey: "k", provider: "openrouter", request: { model: "typesafe/jev-1.13", state: {}, questions: {} } });
  s.eq("ust akis erisilemez -> upstream_unreachable", r.error, "upstream_unreachable");
}

/* ---------------- 9) Istemci protokolu (index.html) ---------------- */
(async () => {
  const w = await boot({ skipRenderWait: true });
  s.eq("istemci: min token uzunlugu 16", w.DRIVE_MIN_TOKEN_LEN, 16);
  s.eq("istemci: veri siniri 1 MB", w.DRIVE_LIMIT_BYTES, 1000000);

  w.localStorage.setItem("pk_drive_url", "https://script.google.com/macros/s/ABC/exec");
  w.localStorage.setItem("pk_drive_token", TOKEN);
  s.eq("driveUrlFor kayitli adresi verir", w.driveUrlFor(), "https://script.google.com/macros/s/ABC/exec");
  s.eq("driveTokenGet kayitli tokeni verir", w.driveTokenGet(), TOKEN);

  const body = JSON.parse(w.driveBody({ action: "ping" }));
  s.eq("driveBody token'i govdeye koyar", body.token, TOKEN);
  s.eq("driveBody action alanini korur", body.action, "ping");

  /* drivePost: POST + no-store + token govdede, URL'de DEGIL */
  let seen = null;
  w.fetch = (url, init) => { seen = { url, init }; return Promise.resolve({ ok: true, status: 200, text: async () => "{}" }); };
  await w.drivePost("put", { data: "{}" });
  s.eq("drivePost POST kullanir", seen.init.method, "POST");
  s.eq("drivePost cache no-store", seen.init.cache, "no-store");
  s.ok("drivePost Content-Type text/plain", String(seen.init.headers["Content-Type"]).indexOf("text/plain") === 0);
  s.eq("token URL'de YOK", seen.url.indexOf(TOKEN), -1);
  s.ok("token govdede VAR", JSON.parse(seen.init.body).token === TOKEN);
  s.ok("URL'de query string yok (?token= kalibi kapali)", seen.url.indexOf("?") === -1);

  /* _driveEnabled: iki ayar da gerekli */
  s.true("driveEnabled: url+token varsa acik", w._driveEnabled());
  w.localStorage.removeItem("pk_drive_token");
  s.true("driveEnabled: token yoksa kapali", w._driveEnabled() === false);
  w.localStorage.setItem("pk_drive_token", TOKEN);
  w.localStorage.removeItem("pk_drive_url");
  s.true("driveEnabled: url yoksa kapali", w._driveEnabled() === false);

  /* Anlik goruntu anahtari: uzak veri uygulanmadan once yerel kopya saklanir */
  s.ok("anlik goruntu anahtari tanimli (geri donus icin)",
    /pk_drive_snapshot/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")));

  s.done();
})().catch((e) => {
  console.error("BEKLENMEYEN HATA:", (e && e.stack) || e);
  process.exitCode = 1;
});
