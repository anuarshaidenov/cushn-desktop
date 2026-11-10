#!/usr/bin/env bash
# Checks a packaged Cushn.app: the migrations ship in Resources, and the app's own binary, run the
# way the MCP relay runs it (ELECTRON_RUN_AS_NODE), loads its better-sqlite3 and opens a database.
# An x64 app runs under Rosetta; without Rosetta it's skipped.
set -euo pipefail

app=$(cd "${1:?usage: smoke-test-mac.sh path/to/Cushn.app}" && pwd)
resources="$app/Contents/Resources"
binary="$app/Contents/MacOS/Cushn"

test -f "$resources/drizzle/meta/_journal.json" || {
  echo "$app: no drizzle/meta/_journal.json in Resources" >&2
  exit 1
}

if [ "$(lipo -archs "$binary")" = x86_64 ] && ! arch -x86_64 /usr/bin/true 2>/dev/null; then
  echo "$app: skipped loading better-sqlite3, Rosetta isn't installed"
  exit 0
fi

# shellcheck disable=SC2016 # JavaScript, not shell: the $ signs are template literals.
ELECTRON_RUN_AS_NODE=1 "$binary" -e '
  const Database = require(process.argv[1]);
  const { version } = new Database(":memory:").prepare("select sqlite_version() as version").get();
  console.log(`${process.argv[2]}: better-sqlite3 loads (SQLite ${version}, ${process.arch})`);
' "$resources/app.asar/node_modules/better-sqlite3" "$app"
