/**
 * test.js — cekirdek testler: render, sekmeler, para ayristirma/bicimleme,
 * PIN (SHA-256 + kilit), DeepSeek istek govdesi, uzak veri dogrulama,
 * yerel tarih/ay yardimcilari ve demo veri ayrimi.
 */
const { createSuite } = require("./tiny");
const { boot, waitFor, click, appHtml } = require("./harness");

const s = createSuite("test.js");

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof obj === "string" ? obj : JSON.stringify(obj)),
    json: async () => obj,
  };
}

(async () => {
  /* ---------- 1) Render ve surum ---------- */
  const w = await boot();
  const pkg = require("../package.json");
  s.ok("APP_VERSION bicimi gecerli (x.y)", /^\d+\.\d+$/.test(w.APP_VERSION), w.APP_VERSION);
  s.eq("<title> surumle uyumlu", w.document.title, "Para Kontrol v" + w.APP_VERSION);
  s.eq("package.json surumu APP_VERSION ile uyumlu", pkg.version, w.APP_VERSION + ".0");
  s.ok("React render oldu (#root dolu)", w.document.getElementById("root").children.length > 0);
  s.eq("baslangicta konsol hatasi yok", w.__consoleErrors.length, 0);

  const tabBtns = w.document.querySelectorAll(".tabbar button");
  s.eq("4 sekme var", tabBtns.length, 4);
  s.ok("ilk sekme 'harcama' aktif", (tabBtns[0].className || "").indexOf("active") !== -1);

  /* ?tab= parametresi sekme secimini belirler */
  const wOzet = await boot({ search: "?tab=ozet" });
  const ozetBtns = wOzet.document.querySelectorAll(".tabbar button");
  s.ok("?tab=ozet ile ozet sekmesi aktif", (ozetBtns[3].className || "").indexOf("active") !== -1);
  s.ok("ozet sekmesi aylik ozet iceriyor", (wOzet.document.body.textContent || "").indexOf("Özet") !== -1);
  const wGecersiz = await boot({ search: "?tab=yok" });
  s.ok("gecersiz ?tab degeri harcama'ya duser",
    (wGecersiz.document.querySelectorAll(".tabbar button")[0].className || "").indexOf("active") !== -1);

  /* Sekme gecisi (React onClick) */
  click(w, tabBtns[1]);
  await waitFor(() => (w.document.querySelectorAll(".tabbar button")[1].className || "").indexOf("active") !== -1);
  s.ok("sekme tiklamasi calisiyor", true);

  /* ---------- 2) parseNum: TR/EN ayirici cozumleme ---------- */
  s.eq("parseNum TR binlik", w.parseNum("1.234,56"), 1234.56);
  s.eq("parseNum EN binlik", w.parseNum("1,234.56"), 1234.56);
  s.eq("parseNum tam sayi", w.parseNum("850"), 850);
  s.eq("parseNum kuruslu kisa", w.parseNum("12,50"), 12.5);
  s.eq("parseNum '0.500' ondalik", w.parseNum("0.500"), 0.5);
  s.eq("parseNum sembollu", w.parseNum("₺ 1.200"), 1200);
  s.ok("parseNum gecersiz -> NaN", isNaN(w.parseNum("abc")));
  s.ok("parseNum bos -> NaN", isNaN(w.parseNum("")));
  s.ok("parseNum '-' -> NaN", isNaN(w.parseNum("-")));
  s.eq("parseNum sayi gecirir", w.parseNum(42.5), 42.5);

  /* ---------- 3) fmt: bicimlendirme ---------- */
  s.eq("fmt tam sayi", w.fmt(1234), "1.234 ₺");
  s.eq("fmt kuruslu", w.fmt(1234.5), "1.234,50 ₺");
  s.eq("fmt sifir", w.fmt(0), "0 ₺");
  s.eq("fmt bos", w.fmt(""), "0 ₺");
  s.eq("fmt NaN", w.fmt("x"), "0 ₺");
  s.ok("fmt EN yerel", w.fmt(1234.5, { sym: "$", loc: "en-US" }).indexOf("1,234.50") === 0);

  /* ---------- 4) Yerel tarih/ay yardimcilari (UTC kaymasi yok) ---------- */
  s.eq("tdy() YYYY-MM-DD uretir", /^\d{4}-\d{2}-\d{2}$/.test(w.tdy()), true);
  const d = new Date();
  s.eq("tdy() yerel gun", w.tdy(), d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
  s.eq("mkk() ay anahtari", w.mkk(2026, 0), "2026-01");
  s.eq("dueDateForMonth 31 -> Subat kirpilir", w.dueDateForMonth(2026, 1, 31), "2026-02-28");
  s.eq("dueDateForMonthKey", w.dueDateForMonthKey("2026-02", 15), "2026-02-15");

  /* ---------- 5) Demo veri ayrimi ---------- */
  const demo = w.sampleDemo();
  s.true("sampleDemo _demo bayragi tasir", demo._demo === true);
  s.ok("sampleDemo harcama icerir", (demo.expenses || []).length > 0);
  s.ok("demo kategorileri DC listesinden", (demo.categories || []).length > 0);
  const iniState = w.ini();
  s.true("ini() demo bayragi tasimaz", iniState._demo === undefined);
  s.eq("ini() sifir harcama", iniState.expenses.length, 0);
  s.eq("ini() 2 varsayilan borc", iniState.debts.length, 2);

  /* ---------- 6) Sifreli kasa kriptografisi ---------- */
  const vaultPassphrase = "correct horse battery staple";
  const encrypted = await w.vaultEncryptText("financial-state", vaultPassphrase);
  s.true("kasa zarfi AES-GCM/PBKDF2 bicimini tasir", w.vaultIsEnvelope(encrypted));
  s.ok("sifreli zarfta acik finans verisi yok", encrypted.indexOf("financial-state") === -1);
  s.eq("kasa dogru parolayla cozulur", await w.vaultDecryptText(encrypted, vaultPassphrase), "financial-state");
  let wrongPassRejected = false;
  try { await w.vaultDecryptText(encrypted, "wrong passphrase"); } catch (e) { wrongPassRejected = true; }
  s.true("yanlis parola reddedilir", wrongPassRejected);
  const changedCiphertext = JSON.parse(encrypted);
  changedCiphertext.ciphertext = (changedCiphertext.ciphertext[0] === "A" ? "B" : "A") + changedCiphertext.ciphertext.slice(1);
  let tamperRejected = false;
  try { await w.vaultDecryptText(JSON.stringify(changedCiphertext), vaultPassphrase); } catch (e) { tamperRejected = true; }
  s.true("degistirilmis sifreli veri reddedilir", tamperRejected);
  s.true("kisa kasa parolasi reddedilir", !w.vaultPassphraseIsValid("12345678"));
  s.true("uzun kasa parolasi kabul edilir", w.vaultPassphraseIsValid(vaultPassphrase));

  const wLegacy = await boot({ skipRenderWait: true });
  const legacyState = { expenses: [{ id: "legacy-expense", amount: 1234, date: "2026-09-20", category: "food" }], _demo: false };
  const legacyText = JSON.stringify(legacyState);
  wLegacy.localStorage.setItem(wLegacy.KY, legacyText);
  wLegacy.localStorage.setItem("pk_pin", "1234");
  wLegacy.localStorage.setItem("pk_drive_snapshot", JSON.stringify({ ts: 1, by: "pull", data: legacyText }));
  const migratedState = await wLegacy.vaultMigrateLegacy(vaultPassphrase);
  const localEnvelope = wLegacy.localStorage.getItem(wLegacy.VAULT_STORAGE_KEY);
  const migratedSnapshot = JSON.parse(wLegacy.localStorage.getItem("pk_drive_snapshot"));
  s.eq("legacy kasa migration finans verisini korur", migratedState.expenses[0].id, "legacy-expense");
  s.true("legacy plaintext ana kaydi migration sonrasi silinir", wLegacy.localStorage.getItem(wLegacy.KY) === null);
  s.true("legacy PIN artigi silinir", wLegacy.localStorage.getItem("pk_pin") === null);
  s.true("localStorage ana veri sifreli zarftir", wLegacy.vaultIsEnvelope(localEnvelope));
  s.true("snapshot da sifreli zarfa donusur", !!(migratedSnapshot && migratedSnapshot.envelope && !migratedSnapshot.data));
  const unlockedState = await wLegacy.vaultUnlockLocal(vaultPassphrase);
  s.eq("sifreli kasa tekrar acilinca state korunur", unlockedState.expenses[0].id, "legacy-expense");
  const wRemote = await boot({ skipRenderWait: true });
  const remoteEnvelope = await wRemote.vaultEncryptText(legacyText, vaultPassphrase);
  const remoteState = await wRemote.vaultUnlockRemote(remoteEnvelope, vaultPassphrase);
  s.eq("uzak kasa dogru parolayla acilir", remoteState.expenses[0].id, "legacy-expense");
  s.true("uzak kasa acilinca oturum anahtari kurulur", !!wRemote.VAULT_SESSION);

  /* ---------- 7) DeepSeek istek govdesi ---------- */
  let cap = null;
  const wAi = await boot({ fetch: (url, init) => { cap = { url, init }; return Promise.resolve(jsonResponse({ choices: [{ message: { content: "merhaba" } }] })); } });
  wAi.AI_CONFIG.apiKey = "test-key-123";
  const answer = await wAi.callDeepSeekAI([{ role: "user", content: "selam" }], "tr");
  s.eq("DeepSeek yaniti dondu", answer, "merhaba");
  s.eq("DeepSeek ucu", cap.url, "https://api.deepseek.com/chat/completions");
  s.eq("DeepSeek POST", cap.init.method, "POST");
  s.eq("DeepSeek Authorization", cap.init.headers.Authorization, "Bearer test-key-123");
  const body = JSON.parse(cap.init.body);
  s.eq("DeepSeek model", body.model, wAi.AI_CONFIG.model);
  s.eq("DeepSeek ilk mesaj sistem", body.messages[0].role, "system");
  s.eq("DeepSeek kullanici mesaji korunur", body.messages[1].content, "selam");
  s.eq("thinking kapali (varsayilan)", body.thinking.type, "disabled");
  s.eq("thinking kapaliyken temperature", body.temperature, 0.7);
  s.eq("stream kapali", body.stream, false);

  /* thinking acikken: reasoning_effort + temperature yok */
  cap = null;
  wAi.AI_CONFIG.deepThink = true;
  await wAi.callDeepSeekAI([{ role: "user", content: "selam" }], "tr");
  const body2 = JSON.parse(cap.init.body);
  s.eq("thinking acik", body2.thinking.type, "enabled");
  s.eq("thinking acikken reasoning_effort", body2.reasoning_effort, "high");
  s.eq("thinking acikken temperature gonderilmez", body2.temperature, undefined);
  wAi.AI_CONFIG.deepThink = false;

  /* <think> blogu temizlenir, bos cevapta reasoning_content kullanilir */
  const wAi2 = await boot({ fetch: () => Promise.resolve(jsonResponse({ choices: [{ message: { content: "<think>gizli</think>gorunur" } }] })) });
  wAi2.AI_CONFIG.apiKey = "k";
  s.eq("<think> blogu temizlenir", await wAi2.callDeepSeekAI([], "tr"), "gorunur");
  const wAi3 = await boot({ fetch: () => Promise.resolve(jsonResponse({ choices: [{ message: { content: "", reasoning_content: "akil yurutme" } }] })) });
  wAi3.AI_CONFIG.apiKey = "k";
  s.eq("bos cevapta reasoning_content", await wAi3.callDeepSeekAI([], "tr"), "akil yurutme");

  /* Anahtar yoksa net hata */
  const wNoKey = await boot({ skipRenderWait: true });
  let noKeyMsg = "";
  try { await wNoKey.callDeepSeekAI([], "tr"); } catch (e) { noKeyMsg = e.message; }
  s.ok("anahtar yoksa aciklayici hata", /API key ayarlı değil/.test(noKeyMsg), noKeyMsg);

  /* 401 / 402 / 429 mesajlari */
  for (const [status, needle] of [[401, "reddetti"], [402, "bakiyesi yetersiz"], [429, "Çok fazla istek"]]) {
    const wx = await boot({ fetch: () => Promise.resolve(jsonResponse({ error: { message: "x" } }, status)) });
    wx.AI_CONFIG.apiKey = "k";
    let m = "";
    try { await wx.callDeepSeekAI([], "tr"); } catch (e) { m = e.message; }
    s.ok("HTTP " + status + " mesaji anlamli", m.indexOf(needle) !== -1, m);
  }

  /* ---------- 8) Uzak veri dogrulama (whitelist) ---------- */
  const wv = await boot({ skipRenderWait: true });
  s.eq("sanitizeRemote: dizi reddedilir", wv.sanitizeRemote([]), null);
  s.eq("sanitizeRemote: null reddedilir", wv.sanitizeRemote(null), null);
  s.eq("sanitizeRemote: metin reddedilir", wv.sanitizeRemote("x"), null);

  const cssInject = wv.sanitizeRemote({
    categories: [{ id: "market", label: "Market", icon: "🛒", color: "red;}body{display:none" }],
  });
  s.ok("CSS injection'li renk kabul edilmez",
    cssInject.state.categories.every((c) => /^#[0-9a-f]{6}$/.test(c.color)));
  s.ok("gecersiz kategori duser, varsayilanlar gelir", cssInject.state.categories.length === wv.DC.length);

  const mixed = wv.sanitizeRemote({
    categories: [{ id: "market", label: "Market", icon: "🛒", color: "#22c55e" }],
    expenses: [
      { id: "a", amount: 100, date: "2026-09-01", category: "market", note: "ok" },
      { id: "b", amount: 100, date: "01-09-2026", category: "market" },
      { id: "c", amount: "yok", date: "2026-09-02", category: "market" },
      { id: "d", amount: 50, date: "2026-09-03", category: "bilinmeyen" },
    ],
  });
  s.eq("gecersiz harcamalar duser", mixed.state.expenses.length, 2);
  s.eq("gecersiz tarih atilir", mixed.state.expenses.some((e) => e.date === "01-09-2026"), false);
  s.eq("bilinmeyen kategori ilk kategoriye duser", mixed.state.expenses[1].category, "market");
  s.ok("dropped sayaci raporlanir", mixed.dropped >= 2, "dropped=" + mixed.dropped);

  const ctrl = wv.sanitizeRemote({
    categories: [{ id: "m", label: "Ma\u0000rket", icon: "🛒", color: "#22c55e" }],
    expenses: [{ id: "a", amount: 1, date: "2026-09-01", category: "m", note: "a\u0007b" }],
  });
  s.eq("kontrol karakterleri temizlenir", ctrl.state.expenses[0].note, "ab");

  const big = wv.sanitizeRemote({
    categories: [{ id: "m", label: "M", icon: "x", color: "#22c55e" }],
    expenses: Array.from({ length: wv.DRIVE_MAX.expenses + 50 }, (_, i) => ({ id: "e" + i, amount: 1, date: "2026-09-01", category: "m" })),
  });
  s.eq("harcama sayisi DRIVE_MAX ile sinirli", big.state.expenses.length, wv.DRIVE_MAX.expenses);

  const huge = wv.sanitizeRemote({
    categories: [{ id: "m", label: "M", icon: "x", color: "#22c55e" }],
    expenses: [{ id: "a", amount: 1e12, date: "2026-09-01", category: "m" }],
  });
  s.eq("asiri tutar maxAmount'a kirpilir", huge.state.expenses[0].amount, wv.DRIVE_MAX.maxAmount);

  /* ---------- 9) Supheli uzak veri (veri kaybi korumasi) ---------- */
  const local = { expenses: [{ amount: 5000 }] };
  s.eq("yerel dolu + uzak bos -> empty_remote", wv.remoteSuspicious({ expenses: [] }, local), "empty_remote");
  s.eq("uzak cok kucuk -> tiny_remote", wv.remoteSuspicious({ expenses: [{ amount: 100 }] }, local), "tiny_remote");
  s.eq("uzak makul -> suphe yok", wv.remoteSuspicious({ expenses: [{ amount: 4000 }] }, local), "");
  s.eq("yerel bosken suphe yok", wv.remoteSuspicious({ expenses: [] }, { expenses: [] }), "");

  /* ---------- 10) Demo veri Drive'a gitmez ---------- */
  s.ok("demo bayragi _demo ile isaretli", w.ld()._demo === true);

  /* ---------- 11) Sesli sohbet kaldirildi (v12.7) ---------- */
  /* AI paneli ozet sekmesinde render edilir (?tab=ozet) */
  const wv7 = await boot({ search: "?tab=ozet" });
  const src7 = appHtml();
  s.ok("index.html'de 'Sesli Sohbet' metni yok", src7.indexOf("Sesli Sohbet") === -1);
  s.ok("index.html'de 'Voice Chat' metni yok", src7.indexOf("Voice Chat") === -1);
  s.ok("Web Speech API kullanimi kalmadi",
    src7.indexOf("speechSynthesis") === -1 && src7.indexOf("SpeechRecognition") === -1);
  s.ok("sesli sohbet localStorage anahtari kalmadi (pk_voice_)", src7.indexOf("pk_voice_") === -1);
  s.ok("sesli sohbet fonksiyonlari kalmadi (voiceClose/voiceToggle)",
    src7.indexOf("voiceClose") === -1 && src7.indexOf("voiceToggle") === -1);
  const aiBtns7 = Array.from(wv7.document.querySelectorAll("button"))
    .map((b) => (b.textContent || "").trim())
    .filter((tx) => /AI ile Yorumla|AI'ya Sor/.test(tx));
  s.eq("AI panelinde 2 buton kaldi (sesli sohbet butonu gitti)", aiBtns7.length, 2);
  const micBtns7 = Array.from(wv7.document.querySelectorAll("button"))
    .filter((b) => (b.textContent || "").indexOf("\uD83C\uDFA4") !== -1);
  s.eq("mikrofon (sesli sohbet) butonu DOM'da yok", micBtns7.length, 0);
  s.ok("arayuzde 'Sesli Sohbet' metni yok", (wv7.document.body.textContent || "").indexOf("Sesli Sohbet") === -1);
  s.eq("sesli sohbet kaldirildiktan sonra konsol hatasi yok", wv7.__consoleErrors.length, 0);

  s.done();
})().catch((e) => {
  console.error("BEKLENMEYEN HATA:", e && e.stack || e);
  process.exitCode = 1;
});
