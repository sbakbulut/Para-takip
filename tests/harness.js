/**
 * Para Kontrol — test altyapisi (jsdom)
 * =====================================
 * index.html'i jsdom icinde calistirir. CDN'e CIKMAZ: React/ReactDOM/htm
 * paketlerin YEREL UMD kopyalarindan (node_modules) gomulur; boylece testler
 * cevrimdisi ve deterministiktir.
 *
 * Kullanim:
 *   const { boot, waitFor } = require("./harness");
 *   const w = await boot({ search: "?tab=ozet" });
 *   w.parseNum("1.234,56") === 1234.56
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "index.html");

function lib(rel) {
  return fs.readFileSync(path.join(ROOT, "node_modules", rel), "utf8");
}

const VENDOR = () => [
  lib("react/umd/react.production.min.js"),
  lib("react-dom/umd/react-dom.production.min.js"),
  lib("htm/dist/htm.umd.js"),
];

/* index.html'i oku, 3 CDN <script src> etiketini yerel UMD icerikle degistir. */
function appHtml() {
  let html = fs.readFileSync(APP, "utf8");
  const [react, reactDom, htm] = VENDOR();
  const swaps = [
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react\/[^"]*"><\/script>/,
      () => "<script>" + react + "</script>"],
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/[^"]*"><\/script>/,
      () => "<script>" + reactDom + "</script>"],
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/htm\/[^"]*"><\/script>/,
      () => "<script>" + htm + "</script>"],
  ];
  for (const [re, rep] of swaps) {
    if (!re.test(html)) throw new Error("CDN script etiketi bulunamadi: " + re);
    html = html.replace(re, rep);
  }
  return html;
}

/* Uygulamanin ihtiyac duydugu tarayici API'lerini tamamla. */
function polyfill(window, opts) {
  /* Node webcrypto: jsdom'in crypto'sunda subtle YOK, defineProperty ile devral. */
  const webcrypto = require("crypto").webcrypto;
  try {
    Object.defineProperty(window, "crypto", {
      value: webcrypto, configurable: true, writable: true, enumerable: true,
    });
  } catch (e) {
    try { window.crypto = webcrypto; } catch (e2) {}
  }
  const { TextEncoder, TextDecoder } = require("util");
  try { Object.defineProperty(window, "TextEncoder", { value: TextEncoder, configurable: true, writable: true }); } catch (e) { window.TextEncoder = TextEncoder; }
  try { Object.defineProperty(window, "TextDecoder", { value: TextDecoder, configurable: true, writable: true }); } catch (e) { window.TextDecoder = TextDecoder; }
  window.matchMedia = function (q) {
    return { matches: /light/.test(q) ? !!(opts && opts.prefersLight) : false,
      media: q, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, onchange: null };
  };
  window.URL.createObjectURL = () => "blob:para-kontrol-test";
  window.URL.revokeObjectURL = () => {};
  window.speechSynthesis = {
    getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {}, speaking: false, pending: false,
  };
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
  window.Notification = function () {};
  window.Notification.permission = "denied";
  window.Notification.requestPermission = () => Promise.resolve("denied");
  window.navigator.clipboard = { writeText: () => Promise.resolve() };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.animate = () => ({ cancel() {}, finished: Promise.resolve() });
  /* Testlerde kazara ag cagrisi olursa gorunur olsun */
  window.fetch = (url, init) => {
    if (opts && opts.fetch) return opts.fetch(url, init, window);
    return Promise.reject(new Error("TEST: beklenmeyen fetch -> " + url));
  };
  window.__alerts = [];
  window.alert = (m) => { window.__alerts.push(String(m)); };
  window.confirm = () => (opts && opts.confirmAnswer !== undefined ? !!opts.confirmAnswer : false);
  window.prompt = () => null;
}

/**
 * Uygulamayi jsdom icinde baslatir ve React render'inin oturmasi icin bekler.
 * @param {object} opts
 *   search         : "?tab=ozet" gibi sorgu (URL'e eklenir)
 *   storage        : { "pk_lang": "en", ... } onceden yazilacak localStorage degerleri
 *   fetch          : (url, init, window) => Promise  ozel fetch
 *   skipRenderWait : React render'ini beklemeyi atla
 */
async function boot(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  vc.on("error", (...a) => errors.push(new Error("console.error: " + a.join(" "))));

  const html = appHtml();
  const url = "http://localhost:8080/index.html" + (opts.search || "");
  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      polyfill(window, opts);
      if (opts.storage) {
        for (const k of Object.keys(opts.storage)) {
          window.localStorage.setItem(k, String(opts.storage[k]));
        }
      }
    },
  });
  const window = dom.window;
  if (!opts.skipRenderWait) {
    await waitFor(() => window.document.getElementById("root").children.length > 0, 5000, window);
  }
  window.__consoleErrors = errors;
  return window;
}

function waitFor(fn, timeoutMs = 3000, window) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      let ok = false;
      try { ok = !!fn(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor zaman asimi"));
      const raf = window && window.requestAnimationFrame;
      if (raf) raf(tick); else setTimeout(tick, 10);
    })();
  });
}

/* Tiklama: htm/React onClick handler'ini tetikler. */
function click(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

/* Metnine gore buton bul (React render edilmis DOM icinde). */
function findByText(window, selector, text) {
  const nodes = Array.from(window.document.querySelectorAll(selector));
  return nodes.find((n) => (n.textContent || "").trim().indexOf(text) !== -1);
}

module.exports = { boot, waitFor, click, findByText, appHtml, ROOT, APP };
