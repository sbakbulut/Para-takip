/**
 * test-category-order.js — kategorileri ELLE siralama (yukari/asagi oklari).
 *
 * Kapsam:
 *   1) Duzenleme modunda ok dugmeleri/ipucu, uc kisitlari (devre disi oklar)
 *   2) Yukari/asagi tasima siralamayi degistiriyor
 *   3) Harcama ekrani kategori secicisi + arama filtresi yeni sirayi kullaniyor
 *   4) Kasa (AES-GCM) modunda yeni sira sifreli zarfa yaziliyor ve sayfa
 *      yenilendikten sonra da korunuyor
 *   5) Demoda siralama SADECE oturumda kalir (demo veri diske yazilmaz)
 *   6) Ingilizce arayuzde ok etiketleri cevrilir
 */
const { createSuite } = require("./tiny");
const { boot, waitFor, click } = require("./harness");

const s = createSuite("test-category-order.js");

const PASS = "kategori-siralama-parolasi";
const VAULT_KEY = "pk_vault_v1";
const LOCAL_KEY = "para_kontrol_demo_v2";
const UP = "Yukarı taşı", DOWN = "Aşağı taşı", HINT = "Sıralamak için okları kullan.";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const upBtns = (w) => Array.from(w.document.querySelectorAll('button[aria-label="' + UP + '"]'));
const downBtns = (w) => Array.from(w.document.querySelectorAll('button[aria-label="' + DOWN + '"]'));
const pills = (w) => Array.from(w.document.querySelectorAll(".cat-pill"))
  .map((b) => (b.querySelectorAll("span")[1] || {}).textContent);
/* Duzenleme listesindeki satirlarin kategori adlari (satir sirasi = kategori sirasi) */
const editLabels = (w) => upBtns(w).map((b) => {
  const row = b.parentElement.parentElement;
  const label = row.querySelector("span");
  return label && label.textContent;
});
const indexOf_ = (w, label) => editLabels(w).indexOf(label);
const labels = (cats) => cats.map((c) => c.label);
/* Tam metinle buton bul: kisa etiketler (⚙️, 🔍) baska dugmelerle karismasin. */
const exactBtn = (w, text) => Array.from(w.document.querySelectorAll("button"))
  .find((b) => (b.textContent || "").trim() === text);

/* Ayni kategorinin yukari okuna basip sira degisimini bekler. */
async function moveUp(w, label) {
  const i = indexOf_(w, label);
  click(w, upBtns(w)[i]);
  await waitFor(() => indexOf_(w, label) === i - 1);
}
/* Kasa parolasiyla acilan pencerede harcama girisi olan gercek (demo olmayan) durum. */
function vaultSeed(w) {
  return w.eval("(function(){var d=ld();delete d._demo;return d})()");
}

(async () => {
  /* ---------- 1) Demo modunda duzenleme modu + oklar ---------- */
  const w = await boot();
  const start = pills(w);
  s.eq("kategori secicisi 12 kategori listeliyor", start.length, 12);

  const toggle = exactBtn(w, "⚙️ Düzenle");
  s.ok("kategori duzenleme dugmesi bulundu", !!toggle);
  click(w, toggle);
  await waitFor(() => upBtns(w).length === start.length);

  s.eq("her kategori icin yukari oku var", upBtns(w).length, start.length);
  s.eq("her kategori icin asagi oku var", downBtns(w).length, start.length);
  s.ok("siralama ipucu metni gorunuyor", (w.document.body.textContent || "").indexOf(HINT) !== -1);
  s.ok("oklar erisilebilir etiket tasiyor",
    upBtns(w).every((b) => b.getAttribute("aria-label") === UP) &&
    downBtns(w).every((b) => b.getAttribute("aria-label") === DOWN));
  s.ok("ok dugmeleri type=button (form gonderimi yok)", upBtns(w).every((b) => b.getAttribute("type") === "button"));
  s.true("ustteki kategorinin yukari oku devre disi", upBtns(w)[0].disabled);
  s.true("alttaki kategorinin asagi oku devre disi", downBtns(w)[downBtns(w).length - 1].disabled);
  s.true("ortadaki oklar etkin", !upBtns(w)[1].disabled && !downBtns(w)[1].disabled);
  s.eq("duzenleme listesi secici ile ayni sirada", editLabels(w), start);

  /* ---------- 2) Yukari / asagi tasima ---------- */
  click(w, upBtns(w)[1]);
  const swapped = [start[1], start[0]].concat(start.slice(2));
  await waitFor(() => editLabels(w)[0] === swapped[0]);
  s.eq("yukari oku kategoriyi bir ust siraya tasidi", editLabels(w), swapped);

  click(w, downBtns(w)[0]);
  await waitFor(() => editLabels(w)[0] === start[0]);
  s.eq("asagi oku kategoriyi eski yerine tasidi", editLabels(w), start);

  /* ---------- 3) Uctaki (devre disi) oklar siralamayi bozmaz ---------- */
  click(w, upBtns(w)[0]);
  click(w, downBtns(w)[downBtns(w).length - 1]);
  await wait(200);
  s.eq("devre disi oklar siralamayi bozmuyor", editLabels(w), start);

  /* ---------- 4) Basa tasima + secici/arama filtresi ---------- */
  const last = start[start.length - 1];
  for (let i = 0; i < start.length - 1; i++) await moveUp(w, last);
  const expectedTop = [last].concat(start.slice(0, start.length - 1));
  s.eq("en alttaki kategori tek tek yukari tasinarak basa alindi", editLabels(w), expectedTop);
  s.true("basa tasinan kategorinin yukari oku artik devre disi", upBtns(w)[0].disabled);

  click(w, exactBtn(w, "✓ Tamam"));
  await waitFor(() => upBtns(w).length === 0 && pills(w).length === start.length);
  s.eq("harcama ekrani kategori secicisi yeni sirayi kullaniyor", pills(w), expectedTop);
  s.eq("kapaliyken ok dugmeleri kaldirildi", upBtns(w).length, 0);

  click(w, exactBtn(w, "🔍"));
  await waitFor(() => Array.from(w.document.querySelectorAll("input"))
    .some((i) => i.getAttribute("placeholder") === "Ara..."));
  const inp = Array.from(w.document.querySelectorAll("input"))
    .find((i) => i.getAttribute("placeholder") === "Ara...");
  const icons = Array.from(inp.parentElement.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
  const iconsByLabel = {};
  w.eval("ld()").categories.forEach((c) => { iconsByLabel[c.label] = c.icon; });
  s.eq("arama filtresi yeni sirayi kullaniyor", icons, ["Tümü"].concat(expectedTop.map((l) => iconsByLabel[l])));

  /* ---------- 5) Demoda siralama oturumla sinirli (demo diske yazilmaz) ---------- */
  s.eq("demo modda veri diske yazilmaz (tasarim)", w.localStorage.getItem(LOCAL_KEY), null);
  s.eq("demo modda kasa zarfi olusturulmaz", w.localStorage.getItem(VAULT_KEY), null);
  s.eq("ilk pencerede konsol hatasi yok", w.__consoleErrors.length, 0);

  /* ---------- 6) Kasa (sifreli) modda KALICILIK ---------- */
  const seed = vaultSeed(w);
  const seedEnvelope = await w.vaultEncryptText(JSON.stringify(seed), PASS);
  s.true("kasa zarfi AES-GCM/PBKDF2 bicimini tasir", w.vaultIsEnvelope(seedEnvelope));

  const w2 = await boot({ storage: { [VAULT_KEY]: seedEnvelope }, promptAnswers: [PASS] });
  const vaultStart = pills(w2);
  s.eq("kasa parolasiyla acildi ve kayitli kategori sirayi gosteriyor", vaultStart, labels(seed.categories));
  s.eq("kasa penceresinde konsol hatasi yok", w2.__consoleErrors.length, 0);

  click(w2, exactBtn(w2, "⚙️ Düzenle"));
  await waitFor(() => upBtns(w2).length === vaultStart.length);
  const vaultLast = vaultStart[vaultStart.length - 1];
  for (let i = 0; i < vaultStart.length - 1; i++) await moveUp(w2, vaultLast);
  const vaultExpected = [vaultLast].concat(vaultStart.slice(0, vaultStart.length - 1));
  s.eq("kasa modunda da basa tasindi", editLabels(w2), vaultExpected);

  await waitFor(() => w2.localStorage.getItem(VAULT_KEY) !== seedEnvelope);
  const storedEnvelope = w2.localStorage.getItem(VAULT_KEY);
  s.true("yeni sira sifreli kasaya yazildi (duz metin degil)", storedEnvelope !== seedEnvelope && w2.vaultIsEnvelope(storedEnvelope));
  s.eq("kasada harcama verisi sizmiyor (duz metin yok)", storedEnvelope.indexOf("Market") === -1, true);

  const decrypted = JSON.parse(await w2.vaultDecryptText(storedEnvelope, PASS));
  s.eq("kasa cozulunce kategori sirayi korunuyor", labels(decrypted.categories), vaultExpected);
  s.eq("kasa cozulunce harcama verisi korunuyor", decrypted.expenses.length, seed.expenses.length);

  /* Sayfa yenilendi: ayni zarfla yeni pencere */
  const w3 = await boot({ storage: { [VAULT_KEY]: storedEnvelope }, promptAnswers: [PASS] });
  s.eq("yenileme sonrasi kategori sirayi korunuyor", pills(w3), vaultExpected);
  s.eq("yenilemede konsol hatasi yok", w3.__consoleErrors.length, 0);

  /* ---------- 7) Ingilizce arayuz ---------- */
  const wEn = await boot({ storage: { pk_lang: "en" } });
  click(wEn, exactBtn(wEn, "⚙️ Edit"));
  await waitFor(() => wEn.document.querySelectorAll('button[aria-label="Move up"]').length > 0);
  s.eq("Ingilizce arayuzde yukari oku etiketi cevrildi",
    wEn.document.querySelectorAll('button[aria-label="Move up"]').length, 12);
  s.ok("Ingilizce arayuzde ipucu metni cevrildi",
    (wEn.document.body.textContent || "").indexOf("Use the arrows to reorder categories.") !== -1);

  s.done();
})().catch((e) => {
  console.error("TEST HATASI: " + (e && e.stack || e));
  process.exit(2);
});
