/**
 * Para Kontrol — Google Drive Senkronizasyonu (GÜVENLİ Apps Script)
 * ================================================================
 * Bu dosyayı Apps Script editörüne yapıştırıp Web App olarak yayınla:
 *   Deploy → New deployment → Web app
 *     Execute as: Me
 *     Who has access: Anyone
 *   (URL: https://script.google.com/macros/s/.../exec)
 *
 * KURULUM
 * 1) Script Properties'e güçlü bir token yaz (editörde bir kez çalıştır):
 *      function kurulum(){ setToken("<EN AZ 16 KARAKTERLİ GİZLİ KELİME>"); }
 * 2) Web App'i yayınla ve URL'i uygulamaya gir (Ayarlar → ☁️ Drive Senkron).
 *
 * GÜVENLİK KURALLARI (bu sürümün uyguladıkları)
 *  - Sadece POST kabul edilir; `doGet` her zaman reddeder (token URL'de taşınamaz).
 *  - Token YALNIZCA istek gövdesinde okunur (e.postData.contents).
 *  - Token karşılaştırması sabit zamanlıdır (zamanlama sızıntısı yok).
 *  - En az 16 karakter token zorunludur.
 *  - Dakikada en fazla 60 istek (kaba kuvvet / suistimal koruması).
 *  - Gövde ve veri boyutu 1 MB ile sınırlıdır.
 *  - Hata yanıtları veri sızdırmaz; token/veri log'a yazılmaz.
 *  - Desteklenen action'lar: "ping" | "get" | "put"
 */

var PROP_DATA = "data";
var PROP_REV = "rev";
var PROP_TOKEN = "token";
var PROP_RATE = "rate";
var MIN_TOKEN_LEN = 16;
var MAX_BYTES = 1000000;   // 1 MB
var RATE_LIMIT = 60;       // istek / dakika
var SCRIPT_REV = "3";      // protokol sürümü (uygulama bunu doğrular)

/* Editörde bir kez çalıştır: token belirle */
function setToken(token) {
  if (!token || String(token).length < MIN_TOKEN_LEN) {
    throw new Error("Token en az " + MIN_TOKEN_LEN + " karakter olmalı.");
  }
  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, String(token));
  Logger.log("Token kaydedildi (" + String(token).length + " karakter).");
}

/* Güvenli olmayan eski kurulumları reddet: token URL'de gönderilirse asla kabul etme */
function doGet(e) {
  return json({ ok: false, error: "method_not_allowed", rev: SCRIPT_REV });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();

  /* 1) Gövde */
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
  if (raw.length > MAX_BYTES) return json({ ok: false, error: "too_large" });

  var body;
  try { body = JSON.parse(raw || "{}"); } catch (err) { return json({ ok: false, error: "bad_json" }); }
  if (!body || typeof body !== "object") return json({ ok: false, error: "bad_json" });

  /* 2) Action beyaz listesi (varsayılan put = eski istemci uyumu) */
  var action = String(body.action || "put");
  if (["ping", "get", "put"].indexOf(action) === -1) return json({ ok: false, error: "bad_action" });

  /* 3) Hız limiti */
  if (rateLimited(props)) return json({ ok: false, error: "rate_limited" });

  /* 4) Token: SADECE gövdeden */
  var token = String(body.token || "");
  var stored = props.getProperty(PROP_TOKEN) || "";
  if (stored.length < MIN_TOKEN_LEN) return json({ ok: false, error: "server_token_missing" });
  if (!safeEqual(token, stored)) return json({ ok: false, error: "unauthorized" });

  /* 5) İşlemler */
  if (action === "ping") {
    return json({ ok: true, rev: SCRIPT_REV, hasData: !!props.getProperty(PROP_DATA) });
  }

  if (action === "get") {
    var data = props.getProperty(PROP_DATA) || "";
    var rev = props.getProperty(PROP_REV) || "";
    return json({ ok: true, rev: SCRIPT_REV, dataRev: rev, data: data });
  }

  /* put */
  var payload = body.data;
  if (typeof payload !== "string") return json({ ok: false, error: "bad_data" });
  if (payload.length > MAX_BYTES) return json({ ok: false, error: "too_large" });

  props.setProperty(PROP_DATA, payload);
  var newRev = String(Date.now());
  props.setProperty(PROP_REV, newRev);
  return json({ ok: true, rev: SCRIPT_REV, dataRev: newRev, bytes: payload.length });
}

/* ---- yardımcılar ---- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Sabit zamanlı karşılaştırma (uzunluk sızıntısı da gizlenir) */
function safeEqual(a, b) {
  a = String(a); b = String(b);
  var maxLen = Math.max(a.length, b.length);
  var diff = a.length === b.length ? 0 : 1;
  for (var i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/* Dakikalık istek sayacı */
function rateLimited(props) {
  var now = Date.now();
  var r = {};
  try { r = JSON.parse(props.getProperty(PROP_RATE) || "{}"); } catch (err) {}
  if (!r.windowStart || (now - r.windowStart) > 60000) r = { windowStart: now, count: 0 };
  r.count = (r.count || 0) + 1;
  props.setProperty(PROP_RATE, JSON.stringify(r));
  return r.count > RATE_LIMIT;
}
