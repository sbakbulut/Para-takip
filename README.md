# Para Kontrol (Para-takip)

Kişisel harcama / gelir / borç takip uygulaması. **Tek dosya** (`index.html`), kurulum gerekmez, veriler yalnızca tarayıcıda (`localStorage`) durur.

- **Canlı:** https://sbakbulut.github.io/Para-takip/
- **Sürüm:** `v11.1` (sürüm numarası tek yerde: `index.html` içindeki `APP_VERSION` sabiti)

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
- `localStorage` anahtarları: `para_kontrol_demo_v2` (veri), `pk_lang`, `pk_theme`, `pk_cur`, `pk_pin`, `pk_pin_lock`, `pk_notif`, `pk_ai_key`, `pk_ai_key_mode`, `pk_ai_think`, `pk_drive_url`, `pk_drive_token`, `pk_drive_snapshot`, `pk_voice_uri`, `pk_voice_speed`.

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

```bash
cd /tmp/smoke && node test.js && node test-sync.js   # jsdom + yerel React kopyaları gerekir
```

## Bilinen sınırlar

- Tek `index.html` → ilk yükleme ~250 KB; React/htm/grafikler CDN'den gelir. İnternet yoksa uygulama açılmaz.
- Grafikler ve Excel dışa aktarma CDN'e bağlıdır.
- Uygulama tamamen istemci tarafıdır: sunucu yok, AI istekleri doğrudan tarayıcıdan DeepSeek'e gider; fiyatlandırma/limitler DeepSeek'e aittir.
- Veri kaybına karşı düzenli olarak **Ayarlar → 💾 Veri → JSON Yedek Al** kullanman önerilir.
