#!/bin/bash
# Rilis APK mobile OneZentra tanpa store.
#
# Prasyarat:
#   - onezentra_mobile/pubspec.yaml sudah di-bump ke versi yang akan dirilis
#     DAN sudah di-commit/push.
#   - Flutter & Android toolchain tersedia di mesin ini.
#   - Akses SSH ke server produksi tersedia.
#
# Contoh:
#   scripts/release-mobile.sh 1.0.2 5 "Perbaikan approval barang luar rencana"
#   scripts/release-mobile.sh 1.0.3 6 "Update ringan" --optional

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$PROJECT_DIR/onezentra_mobile"
PUBSPEC="$MOBILE_DIR/pubspec.yaml"
APK_SOURCE="$MOBILE_DIR/build/app/outputs/flutter-apk/app-release.apk"

SERVER="${OZ_SERVER:-root@187.77.121.102}"
APP_DIR="${OZ_APP_DIR:-/home/onezentra-app}"
REMOTE_APK="/tmp/onezentra-release-$$.apk"

usage() {
  echo "Usage: $0 <version-name> <version-code> <notes> [--optional]" >&2
  echo "Contoh: $0 1.0.2 5 'Perbaikan approval barang luar rencana'" >&2
  exit 1
}

[ $# -ge 3 ] || usage

VERSION_NAME="$1"
VERSION_CODE="$2"
shift 2

FORCE=1
MIN_SUPPORTED="$VERSION_CODE"
NOTES_PARTS=()
for arg in "$@"; do
  if [ "$arg" = "--optional" ]; then
    FORCE=0
    MIN_SUPPORTED=1
  else
    NOTES_PARTS+=("$arg")
  fi
done
NOTES="${NOTES_PARTS[*]}"

if ! [[ "$VERSION_CODE" =~ ^[0-9]+$ ]] || [ "$VERSION_CODE" -le 0 ]; then
  echo "ERROR: version-code harus integer positif." >&2
  exit 1
fi

if [ ! -f "$PUBSPEC" ]; then
  echo "ERROR: $PUBSPEC tidak ditemukan." >&2
  exit 1
fi

PUBSPEC_VERSION="$(grep -E '^version:[[:space:]]*' "$PUBSPEC" | head -1 | sed -E 's/^version:[[:space:]]*//' | tr -d '\r')"
EXPECTED="${VERSION_NAME}+${VERSION_CODE}"
if [ "$PUBSPEC_VERSION" != "$EXPECTED" ]; then
  echo "ERROR: pubspec.yaml masih '$PUBSPEC_VERSION', diharapkan '$EXPECTED'." >&2
  echo "Bump dulu pubspec.yaml lalu commit/push sebelum menjalankan script ini." >&2
  exit 1
fi

echo "==> Build Flutter release ($EXPECTED)..."
(cd "$MOBILE_DIR" && flutter build apk --release)

if [ ! -f "$APK_SOURCE" ]; then
  echo "ERROR: APK tidak ditemukan di $APK_SOURCE" >&2
  exit 1
fi

echo "==> Upload APK ke server..."
scp "$APK_SOURCE" "${SERVER}:${REMOTE_APK}"

echo "==> Publish rilis di server..."
ESCAPED_NOTES="$(printf '%s' "$NOTES" | sed 's/"/\\"/g')"
FORCE_FLAG=""
if [ "$FORCE" -eq 1 ]; then
  FORCE_FLAG="--force"
fi

ssh "$SERVER" "set -e
  cd '$APP_DIR'
  php artisan app:release-apk '$REMOTE_APK' \
    --version-name='$VERSION_NAME' \
    --version-code='$VERSION_CODE' \
    --min-supported-code='$MIN_SUPPORTED' \
    $FORCE_FLAG \
    --notes=\"$ESCAPED_NOTES\"
  rm -f '$REMOTE_APK'
"

echo "==> Verifikasi update-info..."
curl -fsS "https://api.onezentra.sbs/api/v1/app/update-info?platform=android"
echo

echo "Selesai. Build lama akan diminta update sesuai flag yang dipakai."
