# Para Kontrol (Para-takip)

Kişisel harcama / gelir / borç takip uygulaması. **Tek dosya** (`index.html`), kurulum gerekmez, veriler yalnızca tarayıcıda (`localStorage`) durur.

- **Canlı:** https://sbakbulut.github.io/Para-takip/
- **Sürüm:** `v11.0` (sürüm numarası tek yerde: `index.html` içindeki `APP_VERSION` sabiti)

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
| 9 | **Drive token'ı gövdede gönderme seçeneği** | Varsayılan hâlâ `?token=…` (mevcut Apps Script ile uyumlu); isteyen "Gövdede token (güvenli)" moduna geçer. |
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

Uygulama kendi Apps Script Web App'ini kullanır. İki taşıma modu var (Ayarlar → ☁️ Drive Senkron):

| Mod | İstek | Gereksinim |
|---|---|---|
| **URL'de token (uyumlu)** — varsayılan | `GET …exec?token=…` / `POST …exec?token=…` gövde `{"action":"put","data":"…"}` | Mevcut Apps Script yeterli. Token tarayıcı geçmişine/loglara düşebilir. |
| **Gövdede token (güvenli)** | `POST …exec` gövde `{"action":"get","token":"…"}` / `{"action":"put","token":"…","data":"…"}` | Apps Script'in token'ı `e.postData.contents` içinden okuması gerekir. |

Güvenli mod için örnek Apps Script:

```javascript
const TOKEN = "cosmic"; // senin gizli kelimen

function doGet(e)  { return handle(e, "get", ""); }
function doPost(e) {
  const b = JSON.parse(e.postData.contents || "{}");
  return handle({parameter:{token:b.token}}, b.action || "put", b.data || "");
}

function handle(e, action, data) {
  if ((e.parameter.token || "") !== TOKEN) return json({error: "unauthorized"});
  if (action === "get") {
    return json({ok: true, data: PropertiesService.getScriptProperties().getProperty("data") || ""});
  }
  PropertiesService.getScriptProperties().setProperty("data", data);
  return json({ok: true});
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
```

- Push 2 sn gecikmeli (debounce), pull 30 sn'de bir yapılır.
- Demo (`_demo`) veriler Drive'a gönderilmez; Drive'dan gelen veri demo bayrağı taşımaz.

## PIN ve veri güvenliği

- PIN **tuzlu SHA-256** özeti olarak saklanır; 5 yanlış denemede 30 sn kilit (kalan süre ekranda sayılır).
  HTTPS dışı bağlamlarda (`file://`) `crypto.subtle` bulunmazsa geri dönüş olarak `plain:` biçimi kullanılır.
- PIN yalnızca arayüzü kilitler; veriyi şifrelemez. Cihazı paylaşıyorsan tarayıcı profilini ayrı tut.
- AI anahtarı istersen yalnızca oturum belleğinde tutulabilir (önerilir).
- `localStorage` anahtarları: `para_kontrol_demo_v2` (veri), `pk_lang`, `pk_theme`, `pk_cur`, `pk_pin`, `pk_pin_lock`, `pk_notif`, `pk_ai_key`, `pk_ai_key_mode`, `pk_ai_think`, `pk_drive_url`, `pk_drive_token`, `pk_drive_transport`, `pk_voice_uri`, `pk_voice_speed`.

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

## Bilinen sınırlar

- Tek `index.html` → ilk yükleme ~250 KB; React/htm/grafikler CDN'den gelir. İnternet yoksa uygulama açılmaz.
- Grafikler ve Excel dışa aktarma CDN'e bağlıdır.
- Uygulama tamamen istemci tarafıdır: sunucu yok, AI istekleri doğrudan tarayıcıdan DeepSeek'e gider; fiyatlandırma/limitler DeepSeek'e aittir.
- Veri kaybına karşı düzenli olarak **Ayarlar → 💾 Veri → JSON Yedek Al** kullanman önerilir.
