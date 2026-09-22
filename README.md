# Para Kontrol (Para-takip)

Kişisel harcama / gelir / borç takip uygulaması. **Tek dosya** (`index.html`), kurulum gerekmez, veriler yalnızca tarayıcıda (`localStorage`) durur.

- **Canlı:** https://sbakbulut.github.io/Para-takip/
- **Sürüm:** `v12.0` (sürüm numarası tek yerde: `index.html` içindeki `APP_VERSION` sabiti)

## v12.0 — Hibrit yapay zekâ: DeepSeek (System 2) + Jev (System 1)

DeepSeek **akıl hocası** olarak kaldı: sohbet, aylık yorum, derin analiz, sesli asistan. Yanına
**System One** karar modeli **Jev** eklendi: milisaniyelik kararlar, **tipli** çıktılar
(`choice` / `noul` / `score` + kalibre güven) ve arka plan otomasyonları.

| | System 2 (DeepSeek V4.1 Flash) | System 1 (Jev) |
|---|---|---|
| İş | sohbet, yorum, analiz, sesli asistan | karar, sınıflandırma, tarama |
| Çıktı | serbest metin | tipli değer + olasılık + güven |
| Gecikme | saniyeler | ~0 ms (yerel) / 70-500 ms (API) |
| Nerede | `callDeepSeekAI()` | `jevAsk()` |

### Jev nereden çağrılıyor?

**OpenRouter** hesabındaki API anahtarıyla: `POST https://openrouter.ai/api/v1/systemone`
(model `typesafe/jev-latest`). TypeSafe SDK'larıyla **aynı System One sözleşmesi** kullanılır, yani
gövde `{state, model, questions}` → yanıt `{model, answers, usage}`. TypeSafe'a doğrudan bağlanmak
da mümkündür (Ayarlar → Jev → sağlayıcı seçimi).

### Neden iki motor var?

Ağ turu 70-500 ms ve tarayıcıdan yapılan çapraz-köken istek CORS'a takılabilir. "Ekle" anında
uyarı göstermek için bu yeterli değil. Bu yüzden `JEV_CONFIG.engine` üç mod sunar:

| Mod | Davranış |
|---|---|
| `auto` (varsayılan) | Yerel çekirdek kararı **anında** verir; Jev API'si yanıt verirse karar **yükseltilir**. Arayüz asla beklemez. |
| `typesafe` | Yalnızca Jev API'si (ağ kapalıysa yine yerel karara düşer). |
| `local` | Yalnızca yerel çekirdek; hiç ağ çağrısı yapılmaz. |

**Yerel System One çekirdeği** aynı soru tiplerini (`choice`/`noul`/`score`) aynı tipli şekilde
yanıtlar, ama skorlayıcısı kayıtlı olmayan soruda **abstain** eder (uydurmaz) ve deterministik koda
düşer. Güven formülü `top − 0.5×ikinci` TypeSafe'in yayınladığı değerlerle örtüşür
(0.85/0.15→0.78 · 0.56/0.44→0.33 · 1.0/0.0→1.0).

### Altın kural

> **Para matematiği her zaman kodda kalır.** `deficitAmount`, bütçe aşımı, projeksiyon ve eksik
> tutar saf koddan gelir. Model yalnızca yargı üretir ve izni **daraltabilir**, asla **genişletemez**.
> Bütçesi tanımsız bir kategoride model "breach" dese bile karar en fazla `strain` olur (gereksiz blok yok).

### 1) Anlık Harcama Risk Kapısı (Pre-Check / Triage)

Kullanıcı tutarı yazdığı **anda** (Ekle'ye basmadan) hesaplanır — `um()` içinde, render sırasında:

```js
var gate = jevRiskGateSync(input, lang);   // {isAllowed, riskLevel, deficitAmount, confidence, source, reasons[]}
```

- `riskLevel`: `safe` | `watch` | `strain` | `breach`
- `deficitAmount`: **koddan** = `max(0, spent + amount − budget)`
- 4 tipli soru tek istekte: `budget_fit` (noul), `risk_class` (choice), `repeat_risk` (noul), `essential` (noul)
- DeepSeek hiç beklenmez; uyarı milisaniyeler içinde görünür. İstersen "Akıl Danış" ile
  DeepSeek'e (System 2) devredip ayrıntılı yorum alabilirsin.

### 2) Akıllı ve Hızlı İşlem Kategorizasyonu

`"Trendyol'dan kulaklık aldık, 1200 TL"` →

```js
jevCategorizeLocal(text, cats, hist, lang)
// {category:"giyim", confidence:0.62, requiresManualReview:false,
//  amount:1200, note:"Trendyol'dan kulaklık aldık", alternatives:[…]}
```

- **JSON parse edilmez.** Çıktı doğrudan tipli nesnedir; `jevParseLoose()` yalnızca ham
  yanıtı güvenle nesneye çevirir (bozuksa `null`, asla throw etmez).
- Kanıt = `log(oncelik) + log(olabilirlik)`: öncelik kullanıcının **kendi 90 günlük geçmişinden**,
  olabilirlik Türkçe marka/kelime sözlüğünden (ek toleranslı önek eşleşmesi: `marketten`~`market`).
- Öncelik kütlesinin %15'i "harcama değil" seçeneğine ayrılır; kanıt yoksa rastgele kategori seçilmez.
- `requiresManualReview`: güven `0.55` altındaysa, `needs_review` noul'u `≥0.6` ise veya
  ikinci aday birinciye çok yakınsa `true`.

### 3) Arka Planda Bütçe Anomali Taraması (Background Watcher)

Veri değiştikçe (debounce + `requestIdleCallback`) çalışan, ağsız ve ~1 ms süren tarama:

| Test | Yöntem | Yakaladığı |
|---|---|---|
| `cat_daily_spike` | değiştirilmiş z (MAD; MAD=0 ise 1.253×ortalama sapma) | "bugün alışılmadık yüksek" |
| `freq_spike` | Poisson kuyruk `P(X≥k)` | "bugün çok fazla işlem" |
| `budget_projection` | Normal kuyruk (kalan harcama) | "ay sonu bütçe aşılacak" + olasılık |
| `overspend_rate` | Wilson üst sınırı | "sık sık günlük limitin üstünde" |
| `mom_shift` | Welch t testi | "bu ay geçen aydan anlamlı yüksek" |
| `amount_outlier` | log-normal z | "tek başına dev tutar" |
| `silent_recurring` | 3+ ayda aynı not+tutar | "farkında olmadığın abonelik" |

- Sonuçlar tiplidir (`{kind, severity, score, pValue, data}`) ve metin arayüzde üretilir.
- **Ana ekranda hafif rozet:** Özet sekmesi sekme çubuğunda nokta (yüksek önemde kırmızı, diğerinde turuncu).
- Rozete/karta tıklandığında **DeepSeek sohbeti** anomali bağlamıyla açılır (`jevAnomalyToPrompt`) —
  System 1 bulur, System 2 açıklar.
- Eşikler tek yerde: `JEV_THRESHOLDS`. Anomali = istatistiksel sapma, kesin hata değildir.

### Jev anahtarı ve gizlilik

- Anahtar yalnızca cihazda (`pk_jev_key`) veya oturumda (`sessionStorage`) tutulur; **koda gömülmez**.
- **Önemli:** tarayıcıdan çıkan bir anahtar sızabilir. OpenRouter panelinden bu anahtara
  **harcama limiti** koy. Anahtarı istemciden tamamen uzak tutmak için
  **Ayarlar → Jev → Taşıma → Apps Script proxy** seç: istek kendi `gas/Code.gs`'in üzerinden geçer
  (token gövdede, URL'de asla; hedef adres sunucuda beyaz listedir — SSRF kapalı).
  Proxy için `gas/Code.gs`'in bu sürümünü yayınla: script rev **3 → 4** (`jev` action'ı eklendi).
- Anahtar yoksa ağ çağrısı **hiç** yapılmaz; her şey yerel çekirdekle anında sonuçlanır.
- Doğrulama: Ayarlar → Jev → **📡 Test** (gerçek çağrı + adım adım teşhis) ve **🧪 Yerel çekirdek testi**
  (53 kontrol, ağsız). `index.html?testjev=1` de aynı self-test'i ekranda çalıştırır.

### Jev'in çalıştığını nasıl anlarım?

Üç kademeli doğrulama — üçü de bağımsız kanıt verir:

| # | Nerede | Ne görmelisin |
|---|---|---|
| 1 | **Ayarlar → Jev → 📡 Test** | Yeşil **“✓ Jev ÇALIŞIYOR — xxx ms”** + adım listesi (anahtar okundu → istek gönderildi → JSON ayrıştırıldı → tipli cevaplar doğrulandı) + `noul`/`choice`/`score` değerleri. Kırmızı ✗ varsa teşhis **hangi adımda koptuğunu ve ne yapılacağını** yazar. |
| 2 | **Ayarlar → Jev → 🧪 Yerel çekirdek testi** | `✓ 53/53` — ağsız çalışır, yani anahtar/CORS sorunundan bağımsız olarak kodun sağlam olduğunu kanıtlar. |
| 3 | **Harcama sekmesi (canlı davranış)** | Büyük bir tutar yaz → uyarı kutusunun sağ üstündeki etikete bak: **`jev %78`** = karar Jev API'sinden geldi, **`yerel kural`** = cihaz içi çekirdek (ağ yok/anahtar yok/CORS). |

Ek olarak **Özet** sekmesinde `🛰️ Jev Arka Plan Taraması` kartı ve sekme çubuğunda anomali rozeti
görünür — bunlar yerel çekirdekle her zaman çalışır.

Ayarlar'daki **Son çağrı** satırı son denemenin kodunu, HTTP durumunu, ipucunu ve süresini gösterir
(örn. `network · cors_or_blocked · 42 ms`). Anlamları:

| Kod / ipucu | Anlamı | Ne yapmalı |
|---|---|---|
| `network` + `cors_or_blocked` | Tarayıcı isteği engelledi (CORS) | Taşıma → **Apps Script proxy** (+ `Code.gs` rev 4 yayınla) |
| `network` + `offline` | Gerçekten çevrimdışısın | Bağlantı gelince tekrar dene |
| `unauthorized` + `key` | Anahtar reddedildi (401/403) | openrouter.ai/keys'ten yeni anahtar |
| `http_error` + `credits` | Kredi/limit yetersiz (402) | Panelden kredi veya anahtar limiti |
| `http_error` + `rate` | Çok fazla istek (429) | Biraz bekleyip tekrar dene |
| `gas_error` / `gas_proxy_not_configured` | Proxy kurulu değil | Drive Senkron URL+token gir, rev 4'ü yayınla |
| `bad_json` | Yanıt okunamadı | Genelde geçici; yerel karar devrede kalır |
| `timeout` | 6 sn içinde yanıt yok | Tekrar dene ya da `local` moda geç |

**Anahtar güvenliği:** teşhis çıktısı anahtarı **asla** göstermez; yalnızca türü ve uzunluğu
(`OpenRouter (sk-or-v1-) · 73 karakter`) raporlanır. Bu, testle de doğrulanır.


## v11.2 — Drive senkron kurulumu tamamlandı + yer tutucu düzeltmesi

Güvenli protokol (v11.1) canlıya alındı, uçtan uca doğrulandı ve kurulumun geri kalan kısmı tamamlandı:

| # | Değişiklik | Ayrıntı |
|---|---|---|
| 1 | **Apps Script güncellendi ve yayınlandı** | Projedeki eski güvensiz script yerine depodaki `gas/Code.gs` yazıldı (script rev **3**). Sadece bir dağıtım değil, **kalan tüm etkin dağıtımlar** da yeni sürüme geçirildi — hiçbir eski/güvensiz uç açık bırakılmadı. |
| 2 | **Gizli kelime (token) Script Properties'e taşındı** | En az 16 karakter zorunlu. Eski kısa örnek (`cosmic`, 6 karakter) artık sunucu tarafından kabul edilmiyor. |
| 3 | **Yer tutucu düzeltildi** | Ayarlar → ☁️ Drive Senkron'daki yanıltıcı `cosmic` örneği yerine ≥16 karakterlik gerçekçi örnek: `para-takip-2026-K9m2xQ7p` (TR + EN). |

### Doğrulama (yayındaki uçlarda)

| Test | Beklenen | Sonuç |
|---|---|---|
| `POST {action:"ping"}` | `ok:true` | ✅ `{"ok":true,"rev":"3","hasData":…}` |
| `POST {action:"get"}` | `ok:true` | ✅ `{"ok":true,"rev":"3","dataRev":…,"data":…}` |
| `GET <url>?token=…` | `method_not_allowed` | ✅ `{"ok":false,"error":"method_not_allowed","rev":"3"}` |
| `POST` yanlış token | `unauthorized` | ✅ `{"ok":false,"error":"unauthorized"}` |

> **Kurulum notu:** Token değiştiği için uygulamada **⚙️ Ayarlar → ☁️ Drive Senkron** alanına yeni gizli kelime **bir kez** girilip **Kaydet**'e basılmalı, ardından **📡 Test** ile `✓ Güvenli protokol çalışıyor` görülmelidir. Sunucu tarafı boşsa (yeni protokol Script Properties kullanır; eski `parakontrol-data.json` artık okunmaz) uygulama **çakışma uyarısı** gösterir — veri kaybı olmaması için **"Yereli gönder"** seçilmelidir (yerel veri daha güncel kabul edilir).

## v11.1 — Google Drive senkronizasyonu güvenlik sertleştirmesi

Eski kurulumda **token URL'de** (`?token=…`) taşınıyor, **Drive'dan gelen veri doğrulanmadan** uygulanıyordu ve `?debug=1` testi gerçek veriyi üzerine yazıyordu. Kapatılan açıklar:

| # | Zafiyet | Kapatma |
|---|---|---|
| 1 | Token URL'de (tarayıcı geçmişi / referrer / ara katman logları) | İstemci **sadece POST** kullanır, token **yalnızca istek gövdesinde** gider; `driveUrlFor()` hiçbir zaman token eklemez |
| 2 | Eski script `GET ?token=` kabul ediyordu | Yeni `gas/Code.gs`: `doGet` her zaman `method_not_allowed` döner; token yalnızca `e.postData.contents` içinden okunur |
| 3 | Zayıf token / kaba kuvvet koruması yok | Sunucu: **min 16 karakter** zorunlu, **sabit zamanlı** karşılaştırma, **dakikada 60 istek** limiti, 1 MB gövde limiti. İstemci: 16 karakterden kısa token için uyarı + onay |
| 4 | Uzak veri doğrulanmadan uygulanıyordu → **CSS injection** (`categories[].color` inline stile giriyor), tip karmaşası, sınırsız boyut | `sanitizeRemote()`: alan/tipler için **beyaz liste**; renk yalnızca `#rrggbb`; tarih/ay formatı, tutar üst sınırı, metin uzunluğu ve dizi boyutu limitleri; geçersiz kayıtlar atılır ve sayısı bildirilir |
| 5 | Uzaktan boş/küçük veri gelince **yerel veri sessizce siliniyordu** | `remoteSuspicious()`: `empty_remote` / `tiny_remote` durumunda veri uygulanmaz, `conflict` durumuna geçilir; **Uzağı uygula / Yereli gönder / Yok say** seçenekleri sunulur |
| 6 | Geri dönüş yoktu | Her uzak veri uygulanmadan önce yerel **anlık görüntü** (`pk_drive_snapshot`) alınır; **↩ Son senkron öncesine dön** düğmesi |
| 7 | `?debug=1` gerçek veriyi `{debug:true}` ile üzerine yazıyordu (yıkıcı test) | `?debug=1` artık veri yazmayan `ping` testini çalıştırır |
| 8 | Kurulumun doğrulanma yolu yoktu | **📡 Test** düğmesi: güvenli protokolü doğrular ve eski zayıf yolun hâlâ açık olup olmadığını ölçer (gerçek token URL'de gönderilmez) |
| 9 | Yanıt/boyut sınırı yoktu | Yanıt > 1.2 MB veya veri > 1 MB ise uygulanmaz/gönderilmez |

### Kurulum (bir kez)

1. Google Apps Script'te yeni bir proje aç, depodaki **`gas/Code.gs`** içeriğini yapıştır.
2. Editörde `setToken("en-az-16-karakter-gizli-kelime")` fonksiyonunu bir kez çalıştır (token Script Properties'e kaydedilir, koda gömülmez).
3. **Deploy → New deployment → Web app** (Execute as: *Me*, Who has access: *Anyone*) ve `/exec` URL'ini kopyala.
4. Uygulamada **⚙️ Ayarlar → ☁️ Drive Senkron** → URL + aynı token → **Kaydet**.
5. **📡 Test**'e bas: "✓ Güvenli protokol çalışıyor" ve "✓ URL'de token yolu kapalı" görmelisin. Eski script'le "⚠ GÜVENLİK: script hâlâ URL'deki token'ı kabul ediyor" uyarısı çıkar.

> Eski script'ten geçiş: yeni `Code.gs` yayınlandıktan sonra uygulamadaki **Kaydet**'e bir kez basmak yeterli. İstemci artık `?token=` göndermediği için eski script ile senkron çalışmaz (durum çubuğu `method_not_allowed` hatası ve yönlendirme mesajı gösterir).

## v11.0'da neler değişti

| # | Değişiklik | Ayrıntı |
|---|---|---|
| 1 | **MiniMax → DeepSeek V4.1 Flash** | Sohbet/analiz artık `https://api.deepseek.com/chat/completions`, model `deepseek-flash`. MiniMax TTS tamamen kaldırıldı; sesli okuma tarayıcının `speechSynthesis` motoruyla yapılır. |
| 2 | **Tekrarlayan harcamalar bölümü açıldı** | Bütçe sekmesindeki bölüm `display:none` ile gizliydi; artık Harcama sekmesindeki bileşenin aynısı görünür (`recurringSection()`). |
| 3 | **Bütçe profilleri açıldı** | Bütçe sekmesindeki profil bölümü de gizliydi; artık görünür. |
| 4 | **Kırık `pendingRecs` kodu düzeltildi** | `false&&pendingRecs…` (hiç tanımlanmayan değişken) yerine gerçek hesaplama: bu ay ödenmemiş tekrarlayan harcamalar için "Bu Ay Ödenecekler" kartı. `payRec` artık `recurringId` yazar, çift kayıt oluşmaz. |
| 5 | **Kuruşlar korunuyor** | `fmt()` `Math.round` ile kuruşu siliyordu (1.234,56 → 1.235). Artık tam sayılar sade, kuruşlu tutarlar 2 haneli. |
| 6 | **TR/EN sayı girişi** | 19 yerde `parseFloat(x.replace(",", "."))` yalnızca ilk virgülü değiştiriyordu. Yeni `parseNum()` "1.234,56", "1,234.56", "12.500", "0.500", "₺1.999,90" gibi girişlerin hepsini doğru okur. |
| 7 | **PIN güvenliği** | PIN artık düz metin değil **tuzlu SHA-256** özeti (`sha256:<salt>:<hash>`). 5 yanlış denemede 30 sn kilit. Eski 4 haneli düz metin PIN ilk başarılı girişte otomatik yükseltilir. |
| 8 | **API key saklama seçimi** | "Bu cihazda hatırla" (localStorage) veya "Sadece bu oturum" (sessionStorage — sekme kapanınca silinir). Key `sk-` ile başlamıyorsa uyarı. |
| 9 | **Drive token'ı gövdede gönderme seçeneği** | v11.0'da opsiyonel olarak eklendi; **v11.1'de tek ve zorunlu mod** oldu (URL'de token yolu tamamen kaldırıldı). |
| 10 | **Demo veri ayrımı** | Örnek veriler `_demo:true` ile işaretlenir, üstte turuncu şerit görünür. Demo veri Drive'a gönderilmez, bildirim/otomatik kayıt üretmez; ilk kendi kaydını eklediğinde otomatik temizlenir. |
| 11 | **React 18 `createRoot`** | `ReactDOM.render` (deprecated) yerine `createRoot` (eski tarayıcılar için geri dönüş korundu). |
| 12 | **Bakım altyapısı** | `README.md`, `.gitignore`, `publish.sh` (sözdizimi kontrolü + commit + push). |

## Özellikler

- **✏️ Harcama:** ay takvimi, hızlı ekleme şablonları, kategori/not, geri al (undo), arama, "Bu Ay Ödenecekler" hatırlatması
- **💳 Borçlar:** kart/kredi takibi, ödeme geçmişi, geri ödeme tahmini
- **📊 Bütçe:** gelir girişleri, tasarruf hedefi, kategori limitleri, **tekrarlayan harcamalar**, **bütçe profilleri**
- **📈 Özet:** nakit akışı, kategori dağılımı, günlük trend, aylık karşılaştırma, yıllık özet, borç durumu
- **AI (DeepSeek):** aylık yorum, serbest soru-cevap, kaydetmeden önce "akıl danış", sesli sohbet
- **Yedek:** CSV (Excel) dışa aktarma, JSON yedek/dışa-içe aktarma, rapor yazdırma
- **Senkron:** Google Drive (Apps Script üzerinden), PIN kilidi, bildirimler, TR/EN dil, 15 para birimi

## AI kurulumu (DeepSeek)

1. https://platform.deepseek.com adresinden bir API key al (`sk-…`)
2. Uygulama → ⚙️ Ayarlar → **🔑 DeepSeek API Key** → key'i yapıştır
3. Saklama modunu seç: **Bu cihazda hatırla** veya **Sadece bu oturum** (daha güvenli, sekme kapanınca silinir)
4. (İsteğe bağlı) **🧠 Derin düşünme**: kapalıyken hızlı yanıt (`thinking:{type:"disabled"}`), açıkken model adım adım düşünür (`thinking:{type:"enabled"}` + `reasoning_effort:"high"`)

Teknik notlar:

- İstekler tarayıcıdan doğrudan `https://api.deepseek.com` adresine gider; DeepSeek CORS'a izin verir (GitHub Pages origin'i test edildi). Dosyayı `file://` ile açarsan istekler engellenebilir — Pages adresini kullan.
- Zaman aşımı 30 sn; 401/402/429 için anlaşılır hata mesajları gösterilir.
- `content` boş dönerse `reasoning_content` kullanılır; `<think>…</think>` blokları temizlenir.
- Model adı `deepseek-flash` (= DeepSeek-V4.1-Flash). `deepseek-v4-flash` gibi eski adlar kabul edilir ama önerilmez.
- **Sesli okuma** tarayıcının Web Speech motorunu kullanır (DeepSeek TTS sunmaz). Telefonunda Türkçe ses paketi yoksa ses listesi boş görünebilir.

## Google Drive senkronizasyonu

Senkronizasyon protokolü (v11.1 — tek ve güvenli mod, bkz. yukarıdaki kurulum):

| İstek | Gövde | Yanıt |
|---|---|---|
| `POST <web-app-url>` | `{"action":"ping","token":"…"}` | `{ok:true, rev, hasData}` |
| `POST <web-app-url>` | `{"action":"get","token":"…"}` | `{ok:true, rev, dataRev, data:"<json string>"}` |
| `POST <web-app-url>` | `{"action":"put","token":"…","data":"<json string>"}` | `{ok:true, rev, dataRev, bytes}` |
| `GET <web-app-url>` | — | `{ok:false, error:"method_not_allowed"}` (token asla URL'den kabul edilmez) |

Sunucu hata kodları: `unauthorized`, `server_token_missing`, `method_not_allowed`, `rate_limited`, `too_large`, `bad_json`, `bad_action`, `bad_data`.

- Push 2 sn gecikmeli (debounce), pull 30 sn'de bir yapılır.
- Demo (`_demo`) veriler Drive'a gönderilmez; Drive'dan gelen veri demo bayrağı taşımaz.
- Uzak veri uygulanmadan önce yerel **anlık görüntü** alınır (`pk_drive_snapshot`); **↩ Son senkron öncesine dön** ile geri dönülebilir.
- Not: `conflict` durumunda (uzak veri boş/çok küçük) hiçbir şey otomatik uygulanmaz.

## PIN ve veri güvenliği

- PIN **tuzlu SHA-256** özeti olarak saklanır; 5 yanlış denemede 30 sn kilit (kalan süre ekranda sayılır).
  HTTPS dışı bağlamlarda (`file://`) `crypto.subtle` bulunmazsa geri dönüş olarak `plain:` biçimi kullanılır.
- PIN yalnızca arayüzü kilitler; veriyi şifrelemez. Cihazı paylaşıyorsan tarayıcı profilini ayrı tut.
- AI anahtarı istersen yalnızca oturum belleğinde tutulabilir (önerilir).
- Drive token'ı **hiçbir zaman URL'de taşınmaz** (ne istemcide ne sunucuda kabul edilir).
- `localStorage` anahtarları: `para_kontrol_demo_v2` (veri), `pk_lang`, `pk_theme`, `pk_cur`, `pk_pin`, `pk_pin_lock`, `pk_notif`, `pk_ai_key`, `pk_ai_key_mode`, `pk_ai_think`, `pk_drive_url`, `pk_drive_token`, `pk_drive_snapshot`, `pk_voice_uri`, `pk_voice_speed`, `pk_jev_key`, `pk_jev_key_mode`, `pk_jev_mode`, `pk_jev_transport`, `pk_jev_provider`, `pk_jev_cache`.

## Demo veriler

Uygulama ilk açılışta örnek veriyle gelir (`sampleDemo()` → `_demo:true`). Üstteki turuncu şeritten **Temizle** diyebilirsin; ya da ilk kendi kaydını eklemen yeterli — o anda harcama/gelir/borç/bütçe örnekleri silinir, kategori ayarların korunur.

## Geliştirme / yayın

```bash
# yerel önizleme
python3 -m http.server 8080      # http://localhost:8080

# doğrula + commit et (push yok)
./publish.sh -n "deneme"

# yayınla (sözdizimi kontrolü + commit + push)
./publish.sh "commit mesajı"
```

`publish.sh` önce şunları kontrol eder: `APP_VERSION` var mı, `<title>` sürümle uyumlu mu, inline JS sözdizimi geçerli mi (node varsa `node --check`).

### Testler

`index.html` tek dosya olduğu için testler jsdom ile uçtan uca çalışır (CDN yerine yerel React/htm kopyaları):

- `test.js` — render, sekme geçişleri, gizli bölümler, `parseNum`/`fmt`, PIN (SHA-256 + 5 deneme kilidi), DeepSeek istek gövdesi (thinking on/off, 401 mesajı, `reasoning_content`), `sanitizeRemote` (CSS injection / tip / limit), `remoteSuspicious`, güvenli Drive protokolü.
- `test-sync.js` — Drive senaryoları: boş uzak veri → çakışma onayı (yerel veri korunur), geçerli uzak veri → uygulama + anlık görüntü, "Yereli gönder" ile uzak veriyi ezme, `📡 Test` çıktısı, eski zayıf script için GÜVENLİK uyarısı.
- `test-jev.js` — Jev hibrit katmanı (101 kontrol): OpenRouter endpoint/model/başlıkları, tipli cevap doğrulama (küme dışı seçim · aralık dışı olasılık reddi), `jevParseLoose` dayanıklılığı, güven formülü, risk kapısı (`isAllowed`/`riskLevel`/`deficitAmount`, "izin genişletilemez" kuralı), kategorizasyon (marka→kategori, TR tutar biçimleri, "harcama değil" reddi, kişisel geçmiş öğrenmesi), olasılık testleri (Poisson/Wilson/Welch/modified-z), ağ hatası & bozuk JSON'da throw etmeme, `sanitizeRemote` beyaz listesi, ayarlar UI'si, arayüzde anlık uyarı, self-test paneli ve **📡 Test teşhis akışı** (adım adım sonuç, hata ipuçları, anahtarın maskelenmesi/sızmaması).

```bash
cd /tmp/smoke && node test.js && node test-sync.js && node test-jev.js   # jsdom + yerel React kopyaları gerekir
```

## Bilinen sınırlar

- Tek `index.html` → ilk yükleme ~250 KB; React/htm/grafikler CDN'den gelir. İnternet yoksa uygulama açılmaz.
- Grafikler ve Excel dışa aktarma CDN'e bağlıdır.
- Uygulama tamamen istemci tarafıdır: sunucu yok, AI istekleri doğrudan tarayıcıdan DeepSeek'e (sohbet/analiz) ve Jev için OpenRouter'a (`api/v1/systemone`) gider; fiyatlandırma/limitler sağlayıcılara aittir.
  Anahtarı istemciden uzak tutmak istersen **Ayarlar → Jev → Taşıma → Apps Script proxy** kullanılabilir (DeepSeek için böyle bir proxy yok).
- Jev kararları **öneri**dir: yerel çekirdek kural tabanlıdır (kalibre edilmemiş), API yanıtı ise kalibre olasılık taşır. `source` alanı hangi motorun karar verdiğini gösterir. Butce/para hesabı her zaman koddan gelir.
- Veri kaybına karşı düzenli olarak **Ayarlar → 💾 Veri → JSON Yedek Al** kullanman önerilir.
