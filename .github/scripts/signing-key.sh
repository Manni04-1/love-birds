#!/usr/bin/env bash
# Puts Love Birds' private signing key in place for a release build (see android.yml).
#
# The key lives on expo.dev as the sensitive environment variable ANDROID_SIGNING_KEY in the
# production environment: "<password>:<the PKCS12 keystore in base64>". The project owner can
# see it there and keep a copy. If it isn't there yet, this makes one and saves it first, so a
# build never signs with a key that nobody kept. Nothing here prints the key or its password.
set -euo pipefail

eas() { npx --yes eas-cli@27 "$@"; }

dir="$RUNNER_TEMP/signing"
mkdir -p "$dir"
chmod 700 "$dir"
store="$dir/love-birds.p12"
export KEY_COPY="$dir/key"

# env:exec runs the command only once it has read the environment from EAS, so a missing file
# means EAS couldn't be read (stop), and an empty one means there's no key yet.
read_key() {
  rm -f "$KEY_COPY"
  eas env:exec production 'printf "%s" "${ANDROID_SIGNING_KEY:-}" > "$KEY_COPY"' --non-interactive
  if [ ! -f "$KEY_COPY" ]; then
    echo "::error::Couldn't read the environment on expo.dev, so the signing key is unknown."
    exit 1
  fi
}

read_key
if [ ! -s "$KEY_COPY" ]; then
  echo "There's no signing key on expo.dev yet, so this build makes one."
  password=$(openssl rand -hex 24)
  echo "::add-mask::$password"
  keytool -genkeypair -storetype PKCS12 -keystore "$store" -storepass "$password" -keypass "$password" \
    -alias lovebirds -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Love Birds" >/dev/null 2>&1
  # The keystore is encrypted with the password, so the password is what must stay out of logs.
  value="$password:$(base64 -w0 "$store")"
  # Without --force this fails if another build saved a key first.
  eas env:create production --name ANDROID_SIGNING_KEY --value "$value" \
    --visibility sensitive --type string --scope project --non-interactive
  read_key
  if [ "$(cat "$KEY_COPY")" != "$value" ]; then
    echo "::error::The key saved on expo.dev isn't the one this build made, so it stops here."
    exit 1
  fi
  echo "Saved the new signing key on expo.dev as ANDROID_SIGNING_KEY (production)."
fi

value=$(cat "$KEY_COPY")
rm -f "$KEY_COPY"
password=${value%%:*}
echo "::add-mask::$password"
printf '%s' "${value#*:}" | base64 -d > "$store"
keytool -list -keystore "$store" -storepass "$password" -alias lovebirds >/dev/null

{
  echo "LOVE_BIRDS_KEYSTORE=$store"
  echo "LOVE_BIRDS_KEYSTORE_PASSWORD=$password"
} >> "$GITHUB_ENV"
node .github/scripts/use-release-key.js android/app/build.gradle
