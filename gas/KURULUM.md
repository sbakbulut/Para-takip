# KURULUM.md — Drive senkronunu güvenli protokole geçirme (v11.1)

Bu dosya **bir ajana (PC'deki Cline) veya bir insana** verilmek üzere yazılmıştır. Hedef: mevcut Apps Script'i güvenli sürüme geçirmek ve doğrulamak.

## Kim ne yapabilir

| Görev | Kim |
|---|---|
| Google hesabına giriş, "İzin ver / Allow" tıklaması, hesap seçimi | **İnsan** (zorunlu) |
| Apps Script editöründe kod/property düzenleme, Deploy | Tarayıcı otomasyonu olan ajan **veya** insan |
| `curl` ile uçtan uca doğrulama (tarayıcı gerekmez) | **Ajan** |
| Kod/test/deploy (GitHub tarafı) | Ajan |

**Yasaklar (ajan için):** gizli kelimeyi (token) repoya, commit'e, issue'ya, log dosyasına yazma; token'ı URL'de kullanma; token'ı ekrana basma.

## Ön koşul (yapıldı)

`gas/Code.gs` içeriği Apps Script projesine yapıştırıldı ve kaydedildi (Ctrl+S).

## Adım 1 — Gizli kelimeyi (token) kaydet

Gizli kelime: **en az 16 karakter**, tahmin edilemez. Örnek: `para-takip-2026-K9m2xQ7p`

**Yol A (önerilen, kod yazmadan):**
1. Apps Script editöründe sol kenardaki **⚙️ Proje ayarları** (Project Settings)
2. Sayfayı aşağı kaydır → **Betik özellikleri** (Script Properties)
3. **Betik özelliği ekle** (Add script property)
4. **Ad/Property:** `token`  ·  **Değer/Value:** gizli kelime
5. **Kaydet**

**Yol B (kodla):** dosyanın en altına `function tokenAyarla(){ setToken("GIZLI-KELIME"); }` ekle → kaydet → üstteki fonksiyon listesinden `tokenAyarla` seç → **Çalıştır** → izin ekranı: hesap → **Gelişmiş** → **Git (güvenli değil)** → **İzin ver** → konsolda "Token kaydedildi" görünce o satırı sil ve tekrar kaydet.

> Aynı kelime 4. adımda uygulamaya da yazılacak. İki taraf birebir aynı olmalı.

## Adım 2 — Yayınla (aynı URL kalsın)

1. **Deploy → Manage deployments** (Dağıtımı yönet)
2. Mevcut dağıtımın yanındaki **✏️ kalem** → **Version: New version**
3. **Deploy**
4. Web App URL'i kopyala: `https://script.google.com/macros/s/.../exec`

> ✏️ yerine "New deployment" kullanırsan URL **değişir**; o zaman 4. adımda yeni URL'i yapıştır.

## Adım 3 — Doğrula (curl; tarayıcı gerekmez)

```bash
URL='https://script.google.com/macros/s/BURAYA_ID/exec'
TOKEN='gizli-kelimen'

# 1) Güvenli protokol çalışıyor mu?  -> {"ok":true,"rev":"3",...}
curl -s -X POST "$URL" -H 'Content-Type: text/plain' \
  -d "{\"action\":\"ping\",\"token\":\"$TOKEN\"}"

# 2) Kayıt okuma  -> {"ok":true,...,"data":"..."}  (kayıt yoksa data boş)
curl -s -X POST "$URL" -H 'Content-Type: text/plain' \
  -d "{\"action\":\"get\",\"token\":\"$TOKEN\"}"

# 3) GÜVENLİK KONTROLÜ: URL'de token yolu kapalı olmalı
#    Beklenen: {"ok":false,"error":"method_not_allowed"}
curl -s "$URL?token=$TOKEN"

# 4) Yanlış token reddedilmeli -> {"ok":false,"error":"unauthorized"}
curl -s -X POST "$URL" -H 'Content-Type: text/plain' \
  -d '{"action":"ping","token":"yanlis-token-123456"}'
```

Beklenen: 1 ve 2 `ok:true`, 3 `method_not_allowed`, 4 `unauthorized`.

## Adım 4 — Uygulamaya yaz

1. Uygulama → **⚙️ Ayarlar → ☁️ Drive Senkron**
2. **URL** + **aynı gizli kelime** → **Kaydet**
3. **📡 Test** → şu iki satırı görmelisin:
   - `✓ Güvenli protokol çalışıyor (script rev 3, ...)`
   - `✓ URL'de token yolu kapalı (güvenli)`

## Sorun giderme

| Belirti | Anlamı | Çözüm |
|---|---|---|
| `server_token_missing` | Script Property `token` yok | Adım 1 |
| ping'de `method_not_allowed` | Yayınlanan sürüm eski | Adım 2 (New version → Deploy) |
| `unauthorized` | İki taraftaki kelime farklı | Adım 1 + Adım 4'te aynı kelimeyi kullan |
| `rate_limited` | Dakikada 60 istek aşıldı | 1 dakika bekle |
| `too_large` | Veri 1 MB sınırını aştı | JSON yedek alıp eski kayıtları temizle |
| Test'te `⚠ GÜVENLİK: ...` | Eski script hâlâ URL'deki token'ı kabul ediyor | Adım 2 |

## Ajan (PC'deki Cline) için kopyala-yapıştır istem

```text
Görev: Para-takip uygulamamın Google Apps Script (Drive senkron) kurulumunu tamamla.
Talimat dosyası: https://github.com/sbakbulut/Para-takip/blob/main/gas/KURULUM.md
(veya depoyu klonla: git clone https://github.com/sbakbulut/Para-takip)

Kurallar:
- Gizli kelimeyi (token) bana sor; koda, repoya, commit'e, log/çıktı dosyasına YAZMA ve ekrana basma.
- Google hesabıma giriş / "İzin ver" onayı gereken yerlerde tıklamayı bana devret.
- Tarayıcı otomasyonun (Playwright/Chrome DevTools MCP) varsa Adım 1–2'yi uygula; yoksa bana tıklama tıklama tarif et.
- Bitince KURULUM.md'deki 4 curl komutunu çalıştır ve çıktıları bana göster (token'ı maskele).
- Beklenen sonuç: ping/get ok:true, GET ?token= -> method_not_allowed, yanlış token -> unauthorized.
```

## Jev (System One) proxy'si — isteğe bağlı

Jev, **OpenRouter** anahtarınla da çağrılabilir: uygulama varsayılan olarak
`POST https://openrouter.ai/api/v1/systemone` adresine gider (model `typesafe/jev-1.13`).
Tarayıcıdan çıkan bir anahtar sızabileceği için OpenRouter panelinden anahtara **harcama
limiti** koy ya da isteği bu Apps Script üzerinden geçir.

Yukarıdaki `gas/Code.gs` sürümü `"jev"` action'ını içerir. Kurulumu aynıdır (Adım 1–2);
tek fark uygulamada **Ayarlar → Jev → Taşıma** seçimini **Apps Script proxy** yapman.

| Adım | Yapılacak |
|---|---|
| 1 | `gas/Code.gs`'in **yeni** sürümünü editöre yapıştır, kaydet (Ctrl+S) |
| 2 | **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** |
| 3 | Uygulama → **Ayarlar → Jev** → OpenRouter anahtarını gir → **Kaydet** |
| 4 | **Taşıma** → *Apps Script proxy* seç |
| 5 | **📡 Test** → "Jev yanit verdi (… ms)" görmelisin |

Güvenlik notları (proxy tarafı):

- İstek gövdesi: `{action:"jev", token, jevKey, provider, request:{model,state,questions}}`.
- **Hedef adres istemciden alınmaz**; sunucuda beyaz listedir (`openrouter` / `typesafe`) → SSRF kapalı.
- `model` alanı desen denetiminden geçer (`^(typesafe/)?jev-<sürüm>$`) — sürüm değişse de proxy güncellemeye gerek kalmaz.
- `jevKey` yalnızca istek içinde geçer; Script Properties'e **yazılmaz**, yanıtta **geri döndürülmez**, log'a basılmaz.
- Gövde sınırı 200 KB; dakikada 60 istek; `401/403 → unauthorized`, `429 → rate_limited`, `402 → insufficient_credits`.

## Alternatif: Google istemiyorsan (GitHub Gist senkronu)
Apps Script/Google ile hiç uğraşmak istemiyorsan senkron, GitHub Gist üzerinden kurulabilir:

- Depolama: gizli (secret) bir Gist içindeki JSON dosyası
- İstekler tarayıcıdan `https://api.github.com/gists/<id>` adresine gider (GET/PATCH); CORS desteklenir, token `Authorization` başlığında taşınır (URL'de asla)
- Gerçeklemesi için: GitHub'da yalnızca `gist` yetkili bir anahtar (token) oluşturup uygulamaya bir kez yapıştırman yeterli; geri kalan (gist oluşturma, kod, test, yayın) ajan tarafından yapılır
- Bu seçenek kodu değiştirmeyi gerektirir (senkron katmanı GitHub API'sine uyarlanır); mevcut `sanitizeRemote` / çakışma / anlık görüntü korumaları aynen geçerli olur
