#!/usr/bin/env bash
# publish.sh — Para-takip: index.html'i dogrular, commit'ler ve GitHub'a push eder.
#
# Kullanim:
#   ./publish.sh                     # otomatik commit mesaji (surum numarasi ile)
#   ./publish.sh "ozel commit mesaji"
#   ./publish.sh -n "mesaj"          # sadece commit et, PUSH ETME (deneme)
#   ./publish.sh --no-push           # ayni sekilde push etmez
#
# Canli adres: https://sbakbulut.github.io/Para-takip/
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$REPO_DIR/index.html"
cd "$REPO_DIR"

PUSH=1
MSG=""
for arg in "$@"; do
  case "$arg" in
    -n|--no-push) PUSH=0 ;;
    *) MSG="$arg" ;;
  esac
done

[ -f "$FILE" ] || { echo "HATA: index.html bulunamadi ($FILE)"; exit 1; }

# --- Surum: tek kaynak APP_VERSION sabiti ---
VERSION="$(sed -n 's/.*var APP_VERSION="\([^"]*\)".*/\1/p' "$FILE" | head -1)"
[ -n "$VERSION" ] || { echo "HATA: index.html icinde APP_VERSION bulunamadi"; exit 1; }

# --- <title> surumle uyumlu mu? ---
TITLE="$(grep -o '<title>[^<]*</title>' "$FILE" | head -1 | sed -E 's/<\/?title>//g')"
case "$TITLE" in
  *"$VERSION"*) ;;
  *) echo "UYARI: <title> (\"$TITLE\") APP_VERSION (\"$VERSION\") ile uyusmuyor." ;;
esac

# --- JS sozdizimi kontrolu (node varsa) ---
if command -v node >/dev/null 2>&1; then
  TMP_JS="$(mktemp /tmp/para-takip-XXXXXX.js)"
  awk '/<script>/{f=1;next} /<\/script>/{f=0} f' "$FILE" > "$TMP_JS"
  if ! node --check "$TMP_JS" >/dev/null 2>&1; then
    echo "HATA: inline JS sozdizimi bozuk — commit edilmedi."
    node --check "$TMP_JS" || true
    rm -f "$TMP_JS"
    exit 1
  fi
  rm -f "$TMP_JS"
  echo "OK: JS sozdizimi gecerli (v$VERSION)"
else
  echo "UYARI: node bulunamadi, sozdizimi kontrolu atlandi."
fi

git add -A
if git diff --cached --quiet; then
  echo "Degisiklik yok (v$VERSION) — commit gerekmiyor."
  exit 0
fi

[ -n "$MSG" ] || MSG="v$VERSION: $TITLE"

git commit -q -m "$MSG"
echo "OK: commit -> $MSG"

if [ "$PUSH" -eq 1 ]; then
  git push
  echo "TAMAM: push edildi."
  echo "Canli: https://sbakbulut.github.io/Para-takip/  (Pages ~1 dk icinde guncellenir)"
else
  echo "BILGI: --no-push verildi, commit yerelde kaldi."
fi
