/**
 * test-jev.js — Jev (System One) hibrit katmani.
 *
 * Ag GEREKTIRMEZ: fetch taklit edilir. Sinananlar:
 *  - uygulamanin kendi yerel cekirdek oz-testi (jevSelfTest)
 *  - uc noktasi / model slug'i / basliklar (OpenRouter ve TypeSafe)
 *  - model yedek zinciri (400 "does not exist" -> otomatik gecis + hatirlama)
 *  - tipli cevap dogrulama (kume disi secim, aralik disi olasilik reddi)
 *  - ag hatasi / bozuk JSON / zaman asimi durumunda throw ETMEME
 *  - Apps Script proxy tasimasi (Token/anahtar govdede, URL istemciden alinmaz)
 *  - 📡 Test teshis akisi ve ayarlar arayuzu
 */
const { createSuite } = require("./tiny");
const { boot, waitFor, click, findByText } = require("./harness");

const s = createSuite("test-jev.js");

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof obj === "string" ? obj : JSON.stringify(obj)),
    json: async () => obj,
  };
}
const VALID = { model: "typesafe/jev-1.13", answers: { q: { type: "choice", choice: "a", confidence: 0.9, probabilities: { a: 0.9, b: 0.1 } } }, usage: { total_tokens: 5 } };

(async () => {
  /* ---------- 1) Yerel cekirdek oz-testi (ag yok) ---------- */
  const w = await boot({ skipRenderWait: true });
  const self = w.jevSelfTest("tr");
  const failed = self.filter((x) => !x.pass);
  s.ok("jevSelfTest: tum kontroller geciyor (" + self.length + " kontrol)", failed.length === 0,
    failed.slice(0, 5).map((f) => f.name).join(" | "));
  s.ok("jevSelfTest: anlamli sayida kontrol", self.length >= 40, "kontrol=" + self.length);
  const selfEn = w.jevSelfTest("en");
  s.ok("jevSelfTest EN de geciyor", selfEn.filter((x) => !x.pass).length === 0);

  /* ---------- 2) Guvenli ayristirma ---------- */
  s.eq("jevParseLoose: ```json sarmali", w.jevParseLoose('```json\n{"a":1}\n```').a, 1);
  s.eq("jevParseLoose: metin icinde JSON", w.jevParseLoose('sonuc: {"a":2} bitti').a, 2);
  s.eq("jevParseLoose: bozuk -> null", w.jevParseLoose("{bu json degil"), null);
  s.eq("jevParseLoose: bos -> null", w.jevParseLoose(""), null);
  s.eq("jevParseLoose: nesne gecirir", w.jevParseLoose({ a: 1 }).a, 1);

  /* ---------- 3) Motor secimi: anahtar yoksa ag denenmez ---------- */
  s.eq("anahtar yoksa motor 'local'", w.jevEngine(), "local");
  s.ok("yerel motor etiketi Turkce", w.jevEngineLabel("tr").indexOf("Yerel") === 0, w.jevEngineLabel("tr"));

  /* ---------- 4) Uc noktasi, model ve basliklar ---------- */
  let cap = null;
  const wJ = await boot({
    skipRenderWait: true,
    fetch: (url, init) => { cap = { url, init }; return Promise.resolve(jsonResponse(VALID)); },
  });
  wJ.JEV_CONFIG.apiKey = "sk-or-v1-test";
  s.eq("varsayilan saglayici OpenRouter", wJ.jevProvider(), "openrouter");
  s.eq("uc: /api/alpha/decisions (chat/completions DEGIL)", wJ.jevEndpoint(), "https://openrouter.ai/api/alpha/decisions");
  s.eq("uc chat/completions icermez", wJ.jevEndpoint().indexOf("chat/completions"), -1);
  s.eq("varsayilan model slug'i", wJ.jevModelId(), "typesafe/jev-1.13");

  const res = await wJ.jevAskRemote({ a: 1 }, { q: { type: "choice", criteria: { a: "", b: "" } } }, "tr");
  s.eq("jev istegi API'ye gitti", cap.url, "https://openrouter.ai/api/alpha/decisions");
  s.eq("jev POST", cap.init.method, "POST");
  s.eq("Authorization Bearer", cap.init.headers.Authorization, "Bearer sk-or-v1-test");
  s.eq("Content-Type json", cap.init.headers["Content-Type"], "application/json");
  s.ok("atif basligi HTTP-Referer", /^https:\/\//.test(cap.init.headers["HTTP-Referer"] || ""));
  s.eq("atif basligi X-OpenRouter-Title", cap.init.headers["X-OpenRouter-Title"], "Para Kontrol");
  const sent = JSON.parse(cap.init.body);
  s.eq("govde: model", sent.model, "typesafe/jev-1.13");
  s.ok("govde: state tasinir", sent.state && sent.state.a === 1);
  s.ok("govde: questions tasinir", !!sent.questions.q);
  s.true("basarili cagri ok", res.ok === true);
  s.eq("tipli cevap: choice", res.answers.q.choice, "a");
  s.ok("latency raporlanir", typeof res.latencyMs === "number");
  s.notEq = s.notEq || function () {};
  s.eq("yanit modeli raporlanir", res.model, "typesafe/jev-1.13");

  /* TypeSafe saglayicisi dogrudan */
  cap = null;
  wJ.jevSetProvider("typesafe");
  s.eq("provider degisince uc guncellenir", wJ.jevEndpoint(), "https://api.typesafe.ai/v1/systemone");
  s.eq("provider degisince model guncellenir", wJ.jevModelId(), "jev-latest");
  await wJ.jevAskRemote({}, { q: { type: "choice", criteria: { a: "", b: "" } } }, "tr");
  s.eq("TypeSafe adresine gidilir", cap.url, "https://api.typesafe.ai/v1/systemone");
  s.eq("TypeSafe'ta OpenRouter atif basligi yok", cap.init.headers["HTTP-Referer"], undefined);
  wJ.jevSetProvider("openrouter");

  /* ---------- 5) Model yedek zinciri ---------- */
  {
    let calls = [];
    const wF = await boot({
      skipRenderWait: true,
      fetch: (url, init) => {
        const b = JSON.parse(init.body);
        calls.push(b.model);
        if (calls.length === 1) {
          return Promise.resolve(jsonResponse({ error: { message: "Model typesafe/jev-1.13 does not exist" } }, 400));
        }
        return Promise.resolve(jsonResponse(VALID));
      },
    });
    wF.JEV_CONFIG.apiKey = "k";
    const r = await wF.jevAskRemote({}, { q: { type: "choice", criteria: { a: "", b: "" } } }, "tr");
    s.eq("olan adaylar sirayla denenir", calls.length, 2);
    s.eq("1. aday varsayilan slug", calls[0], "typesafe/jev-1.13");
    s.eq("2. aday yedek slug", calls[1], "typesafe/jev-1.13-20260917");
    s.true("yedekle cagri basarili", r.ok === true);
    s.eq("denenen modeller raporlanir", r.modelTried.length, 2);
    s.eq("calisan slug hatirlanir", wF.localStorage.getItem("pk_jev_model_ok"), "typesafe/jev-1.13-20260917");
  }
  {
    /* Tum adaylar olu -> acik hata, sessiz basarisizlik yok */
    let n = 0;
    const wD = await boot({
      skipRenderWait: true,
      fetch: () => { n++; return Promise.resolve(jsonResponse({ error: { message: "Model does not exist" } }, 400)); },
    });
    wD.JEV_CONFIG.apiKey = "k";
    const r = await wD.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.eq("tum adaylar denendi (3)", n, 3);
    s.true("sonuc ok=false", r.ok === false);
    s.eq("hata kodu http_error (400)", r.error.code, "http_error");
    s.eq("ipucu: model bulunamadi", r.hint, "model_not_found");
    s.ok("hata mesaji kullaniciya yol gosterir", /model slug/i.test(r.error.message), r.error.message);
  }

  /* ---------- 6) Elle model secimi (override) ---------- */
  {
    let calls = [];
    const wO = await boot({
      skipRenderWait: true,
      storage: { pk_jev_model: "typesafe/jev-1.14" },
      fetch: (url, init) => { calls.push(JSON.parse(init.body).model); return Promise.resolve(jsonResponse(VALID)); },
    });
    wO.JEV_CONFIG.apiKey = "k";
    s.eq("override tek aday", wO.jevModelCandidates().length, 1);
    await wO.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.eq("override edilen slug kullanilir", calls[0], "typesafe/jev-1.14");
  }

  /* ---------- 7) Hata yollari: asla throw etmez ---------- */
  {
    const wErr = await boot({
      skipRenderWait: true,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    wErr.JEV_CONFIG.apiKey = "k";
    const r = await wErr.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.true("ag hatasi: throw yok, tipli sonuc", r.ok === false);
    s.eq("ag hatasi kodu", r.error.code, "network");
    s.eq("cevrimici iken CORS ipucu", r.hint, "cors_or_blocked");
  }
  {
    const wBad = await boot({ skipRenderWait: true, fetch: () => Promise.resolve(jsonResponse("bu json degil")) });
    wBad.JEV_CONFIG.apiKey = "k";
    const r = await wBad.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.true("bozuk JSON: throw yok", r.ok === false);
    s.eq("bozuk JSON kodu", r.error.code, "bad_json");
  }
  {
    const wTo = await boot({
      skipRenderWait: true,
      fetch: () => { const e = new Error("The operation was aborted."); e.name = "AbortError"; return Promise.reject(e); },
    });
    wTo.JEV_CONFIG.apiKey = "k";
    const r = await wTo.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.eq("zaman asimi kodu", r.error.code, "timeout");
  }
  {
    const wKey = await boot({ skipRenderWait: true, fetch: () => Promise.resolve(jsonResponse({ error: { message: "invalid api key" } }, 401)) });
    wKey.JEV_CONFIG.apiKey = "k";
    const r = await wKey.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.eq("401 -> unauthorized", r.error.code, "unauthorized");
    s.eq("401 ipucu: anahtar", r.hint, "key");
  }
  {
    const w402 = await boot({ skipRenderWait: true, fetch: () => Promise.resolve(jsonResponse({}, 402)) });
    w402.JEV_CONFIG.apiKey = "k";
    s.eq("402 -> kredi ipucu", (await w402.jevAskRemote({}, { q: { type: "noul" } }, "tr")).hint, "credits");
  }

  /* ---------- 8) Tipli cevap dogrulama (kume disi / aralik disi) ---------- */
  {
    const wT = await boot({
      skipRenderWait: true,
      fetch: () => Promise.resolve(jsonResponse({ model: "m", answers: { q: { type: "choice", choice: "z", confidence: 1, probabilities: { a: 1, b: 0 } } } })),
    });
    wT.JEV_CONFIG.apiKey = "k";
    const r = await wT.jevAskRemote({}, { q: { type: "choice", criteria: { a: "", b: "" } } }, "tr");
    s.true("kume disi secim reddedilir", r.ok === false && r.invalid.length === 1);
  }
  {
    const wT2 = await boot({
      skipRenderWait: true,
      fetch: () => Promise.resolve(jsonResponse({ answers: { n: { type: "noul", noul: 3 } } })),
    });
    wT2.JEV_CONFIG.apiKey = "k";
    const r = await wT2.jevAskRemote({}, { n: { type: "noul" } }, "tr");
    s.true("aralik disi olasilik reddedilir", r.ok === false);
  }

  /* ---------- 9) Apps Script proxy tasimasi ---------- */
  {
    let cap2 = null;
    const wP = await boot({
      skipRenderWait: true,
      storage: { pk_drive_url: "https://script.google.com/macros/s/X/exec", pk_drive_token: "token-1234567890ab" },
      fetch: (url, init) => {
        cap2 = { url, init };
        return Promise.resolve(jsonResponse({ ok: true, data: JSON.stringify(VALID) }));
      },
    });
    wP.JEV_CONFIG.apiKey = "sk-or-v1-test";
    wP.JEV_CONFIG.transport = "gas";
    const r = await wP.jevAskRemote({ s: 1 }, { q: { type: "choice", criteria: { a: "", b: "" } } }, "tr");
    s.eq("proxy: Drive adresine gidilir", cap2.url, "https://script.google.com/macros/s/X/exec");
    const pb = JSON.parse(cap2.init.body);
    s.eq("proxy: action=jev", pb.action, "jev");
    s.eq("proxy: token govdede", pb.token, "token-1234567890ab");
    s.eq("proxy: jevKey govdede", pb.jevKey, "sk-or-v1-test");
    s.eq("proxy: provider bildirilir", pb.provider, "openrouter");
    s.eq("proxy: istek icinde model var", pb.request.model, "typesafe/jev-1.13");
    s.eq("proxy: URL'de token yok", cap2.url.indexOf("token"), -1);
    s.true("proxy yaniti ayristirilir", r.ok === true);
  }
  {
    /* Proxy yapilandirilmamissa: sessiz kalmak yok, tipli hata */
    const wP2 = await boot({ skipRenderWait: true, fetch: () => { throw new Error("cagri yapilmamali"); } });
    wP2.JEV_CONFIG.apiKey = "k";
    wP2.JEV_CONFIG.transport = "gas";
    const r = await wP2.jevAskRemote({}, { q: { type: "noul" } }, "tr");
    s.eq("proxy ayarsiz -> gas_proxy_not_configured", r.error.code, "gas_proxy_not_configured");
    s.eq("proxy ipucu", r.hint, "proxy");
  }

  /* ---------- 10) Anahtar maskeleme ---------- */
  s.ok("jevMaskKey anahtari maskeleer", wJ.jevMaskKey("sk-or-v1-abcdef1234567890").indexOf("abcdef") === -1,
    wJ.jevMaskKey("sk-or-v1-abcdef1234567890"));
  s.eq("jevMaskKey bos girdi", wJ.jevMaskKey(""), "yok");

  /* ---------- 11) 📡 Test teshis akisi ---------- */
  {
    let n = 0;
    const wT = await boot({
      skipRenderWait: true,
      fetch: () => {
        n++;
        if (n === 1) return Promise.resolve(jsonResponse({ error: { message: "Model typesafe/jev-1.13 does not exist" } }, 400));
        return Promise.resolve(jsonResponse({
          model: "typesafe/jev-1.13-20260917",
          answers: {
            alive: { type: "noul", noul: 0.75, confidence: 0.8 },
            domain: { type: "choice", choice: "finance", confidence: 0.9, probabilities: { finance: 0.9, other: 0.1 } },
            quality: { type: "score", score: 2, confidence: 0.8, probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 } },
          },
        }));
      },
    });
    wT.JEV_CONFIG.apiKey = "k";
    const t = await wT.jevTestRemote("tr");
    s.true("📡 Test: basarili sonuc", t.ok === true);
    s.ok("📡 Test: 'CALISIYOR' mesaji", /CALISIYOR/.test(t.message), t.message);
    s.ok("📡 Test: adim adim gunluk uretir", t.steps.length >= 4, "adim=" + t.steps.length);
    s.ok("📡 Test: uc ilkel de gosterilir", t.answers.length === 3, "cevap=" + t.answers.length);
    s.ok("📡 Test: yedek zincir bildirilir", t.modelTried.length === 2, t.modelTried.join(" -> "));
    s.ok("📡 Test: anahtar yanitta maskeli",
      JSON.stringify(t).indexOf("sk-or-v1-test") === -1 && t.keyMask.indexOf("test") === -1, t.keyMask);
  }
  {
    const wT = await boot({ skipRenderWait: true });
    const t = await wT.jevTestRemote("tr");
    s.eq("📡 Test: anahtar yoksa nokey", t.hint, "nokey");
    s.true("📡 Test: anahtarsiz ag cagrisi yapilmaz", t.ok === false);
    s.ok("📡 Test: yol gosteren mesaj", /Ayarlar/.test(t.message), t.message);
  }

  /* ---------- 12) ?testjev=1 paneli (gercek tarayici akisi) ---------- */
  {
    const wV = await boot({ search: "?testjev=1" });
    await waitFor(() => wV.document.getElementById("testjev-out"), 8000, wV);
    const txt = wV.document.getElementById("testjev-out").textContent || "";
    s.ok("?testjev=1 paneli ALL PASS gosterir", /ALL PASS/.test(txt), txt.split("\n")[0]);
    s.ok("panel kontrol sayisini yazar", /(\d+)\/(\d+)/.test(txt), txt.split("\n")[0]);
    s.ok("panelde FAIL satiri yok", txt.indexOf("FAIL") === -1);
  }

  /* ---------- 13) Jev ayarlar arayuzu ---------- */
  {
    const wU = await boot();
    const gear = findByText(wU, "button", "⚙");
    s.ok("ayarlar butonu bulundu", !!gear);
    click(wU, gear);
    await waitFor(() => /DeepSeek API Key/.test(wU.document.body.textContent || ""), 5000, wU);
    /* Jev bolumu akordeon: basligi tiklayip ac */
    const jevHead = findByText(wU, "button", "Jev (System One)");
    s.ok("Jev ayar bolumu listede", !!jevHead);
    click(wU, jevHead);
    await waitFor(() => wU.document.querySelector('input[type="password"]'), 5000, wU);
    const body = wU.document.body.textContent || "";
    s.ok("ayarlar penceresi acildi", /OpenRouter/.test(body));
    s.ok("harcama limiti uyarisi gosterilir", /HARCAMA LIMITI/.test(body));
    s.ok("proxy secenegi anlatilir", /proxy/i.test(body));
    s.ok("anahtar alani mevcut (sifre tipi)", !!wU.document.querySelector('input[type="password"]'));
  }

  /* ---------- 14) Anlik analiz karti: tutar alaninin hemen altinda ---------- */
  {
    const wG = await boot();
    const doc = wG.document;
    const inputs = Array.from(doc.querySelectorAll("input"));
    const amtInput = inputs.find((i) => (i.getAttribute("inputmode") || "") === "decimal");
    s.ok("tutar alani bulundu", !!amtInput);
    const setVal = Object.getOwnPropertyDescriptor(wG.HTMLInputElement.prototype, "value").set;
    setVal.call(amtInput, "7500");
    amtInput.dispatchEvent(new wG.Event("input", { bubbles: true }));
    await waitFor(() => Array.from(doc.querySelectorAll("div"))
      .some((d) => (d.textContent || "").trim() === "⚡ Jev anlik analiz"), 5000, wG);
    const eyebrow = Array.from(doc.querySelectorAll("div"))
      .find((d) => (d.textContent || "").trim() === "⚡ Jev anlik analiz");
    const card = eyebrow && eyebrow.parentElement.parentElement.parentElement;
    s.ok("tutar girilince anlik analiz karti gorunur", !!card);
    const catHead = Array.from(doc.querySelectorAll("span")).find((x) => /^kategori$/i.test((x.textContent || "").trim()));
    const noteInput = inputs.find((i) => (i.getAttribute("placeholder") || "").indexOf("Not ekle") === 0);
    const POS = wG.Node.DOCUMENT_POSITION_FOLLOWING;
    s.ok("kart tutar alanindan SONRA", !!(amtInput.compareDocumentPosition(card) & POS));
    s.ok("kart KATEGORI basligindan ONCE (klavye bolgesinde)", !!(card.compareDocumentPosition(catHead) & POS));
    s.ok("kart not alanindan ONCE", !!(card.compareDocumentPosition(noteInput) & POS));
    const txt = (card.textContent || "").trim();
    s.ok("risk basligi sinifli", /(BUTCENI ASIYOR|BUTCEYI ZORLUYOR|BUTCE ICINDE)/.test(txt), txt);
    s.ok("kaynak/guven rozeti var", /(yerel kural|jev)/.test(txt), txt);
    s.eq("anlik analiz sirasinda konsol hatasi yok", wG.__consoleErrors.length, 0);
  }

  s.done();
})().catch((e) => {
  console.error("BEKLENMEYEN HATA:", (e && e.stack) || e);
  process.exitCode = 1;
});
