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
 *  - Desteklenen action'lar: "ping" | "get" | "put" | "jev"
 *
 * JEV PROXY (action: "jev") — NEDEN VAR?
 *  Jev API'si (TypeSafe System One) tarayicidan yapilan capraz-koken
 *  isteklere izin vermeyebilir (CORS). Bu action, istegi sizin kendi
 *  Apps Script'iniz uzerinden gecirir; boylece uygulama CORS'a takilmaz.
 *  - Jev anahtari (body.jevKey) SADECE istek icinde gecer; hicbir yere
 *    yazilmaz, log'a basilmaz, yanitta geri dondurulmez.
 *  - Istek govdesi boyut siniri MAX_BYTES'tir.
 *  - Yalnizca beyaz listedeki iki adrese cikilir (SSRF kapali):
 *      openrouter -> https://openrouter.ai/api/alpha/decisions
 *      typesafe   -> https://api.typesafe.ai/v1/systemone
 *    NOT: Jev bir "decisions" modelidir; OpenRouter'da /chat/completions
 *    bu modeli reddeder, dogru uc /api/alpha/decisions'tir.
 */

var PROP_DATA = "data";
var PROP_REV = "rev";
var PROP_TOKEN = "token";
var PROP_RATE = "rate";
var MIN_TOKEN_LEN = 16;
var MAX_BYTES = 1000000;   // 1 MB
var RATE_LIMIT = 60;       // istek / dakika
var SCRIPT_REV = "6";      // protokol sürümü (uygulama bunu doğrular)
/* Jev proxy: yalnizca bu iki adrese cikilir (SSRF kapali).
   Istemci "provider" alanini secer; URL istemciden ALINMAZ.
   OpenRouter'da Jev bir "decisions" modelidir: /chat/completions DEGIL,
   /api/alpha/decisions kullanilir. */
var JEV_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/alpha/decisions",
  typesafe: "https://api.typesafe.ai/v1/systemone"
};
var JEV_TIMEOUT_MS = 15000;
var JEV_MAX_BYTES = 200000; // proxy govdesi ust siniri

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
  if (["ping", "get", "put", "jev"].indexOf(action) === -1) return json({ ok: false, error: "bad_action" });

  /* 3) Token: SADECE gövdeden */
  var token = String(body.token || "");
  var stored = props.getProperty(PROP_TOKEN) || "";
  if (stored.length < MIN_TOKEN_LEN) return json({ ok: false, error: "server_token_missing" });
  if (!safeEqual(token, stored)) return json({ ok: false, error: "unauthorized" });

  /* 4) Hız limiti yalnızca yetkili istemcileri sayar */
  if (rateLimited(props)) return json({ ok: false, error: "rate_limited" });

  /* 5) İşlemler */
  if (action === "ping") {
    return json({ ok: true, rev: SCRIPT_REV, hasData: !!props.getProperty(PROP_DATA) });
  }

  if (action === "get") {
    var data = props.getProperty(PROP_DATA) || "";
    var rev = props.getProperty(PROP_REV) || "";
    return json({ ok: true, rev: SCRIPT_REV, dataRev: rev, data: data });
  }

  if (action === "jev") return jevProxy(body);

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

/* Jev (System One) proxy'si.
   Istek: {action:"jev", token, jevKey, provider:"openrouter"|"typesafe",
           request:{model,state,questions}}
   Yanit basarili: {ok:true, data:"<ham JSON metni>"}
   Yanit hatali : {ok:false, error:"..."}   (anahtar/veri asla yankilanmaz) */
function jevProxy(body) {
  var key = String(body.jevKey || "");
  var req = body.request;
  if (!key) return json({ ok: false, error: "jev_key_missing" });
  if (!req || typeof req !== "object") return json({ ok: false, error: "bad_request" });

  /* Uzak adres ISTEMCIDEN ALINMAZ: sabit beyaz listeden secilir (SSRF kapali). */
  var provider = String(body.provider || "openrouter");
  var endpoint = JEV_ENDPOINTS[provider];
  if (!endpoint) return json({ ok: false, error: "bad_provider" });

  /* Model kimligi: yalnizca beklenen desen (beyaz liste, surum toleransli) */
  var model = String(req.model || "");
  if (!/^(typesafe\/)?jev-[a-z0-9.\-]+$/i.test(model)) {
    return json({ ok: false, error: "bad_model" });
  }

  var payload;
  try { payload = JSON.stringify(req); } catch (err) { return json({ ok: false, error: "bad_request" }); }
  if (payload.length > JEV_MAX_BYTES) return json({ ok: false, error: "too_large" });

  var headers = { Authorization: "Bearer " + key };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://sbakbulut.github.io/Para-takip/";
    headers["X-OpenRouter-Title"] = "Para Kontrol";
  }

  var resp;
  try {
    resp = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (err) {
    return json({ ok: false, error: "upstream_unreachable" });
  }

  var code = resp.getResponseCode();
  var text = resp.getContentText() || "";
  if (code < 200 || code >= 300) {
    if (code === 401 || code === 403) return json({ ok: false, error: "unauthorized" });
    if (code === 429) return json({ ok: false, error: "rate_limited" });
    if (code === 402) return json({ ok: false, error: "insufficient_credits" });
    return json({ ok: false, error: "upstream_" + code });
  }
  /* Anahtar/log sizintisi yok: yalnizca gövde metni dondurulur. */
  return json({ ok: true, data: text.slice(0, JEV_MAX_BYTES) });
}


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
