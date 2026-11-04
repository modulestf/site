#!/bin/bash
# Mutates temporary copies of the site and confirms tests/site-test.sh catches each break.
# Each case injects its own break; none relies on content already in index.html.
# Run: bash tests/site-test-selftest.sh
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
fails=0

# case name, expected failing check, extra site-test argument, sed -E expression applied to index.html
expect_fail() {
  local name="$1" check="$2" arg="$3" expr="$4" dir="$TMP/$1"
  mkdir -p "$dir/tests"
  cp "$SRC/tests/site-test.sh" "$dir/tests/"
  # Portable across GNU and BSD sed: no -i.
  sed -E "$expr" "$SRC/index.html" >"$dir/index.html"
  if cmp -s "$SRC/index.html" "$dir/index.html"; then
    echo "FAIL $name: the sed expression changed nothing"; fails=$((fails + 1)); return
  fi
  git -C "$dir" init -q
  git -C "$dir" add -A
  local out
  out=$(bash "$dir/tests/site-test.sh" $arg)
  if grep -q "^FAIL $check" <<<"$out"; then
    echo "ok $name"
  else
    echo "FAIL $name: site-test.sh did not report $check"; echo "$out" | sed 's/^/  | /'; fails=$((fails + 1))
  fi
}

expect_fail hype-phrase banned-words "" 's#</main>#<p>A game changer that leverages AI to unlock powerful reviews.</p></main>#'
expect_fail placeholder release --release 's#</main>#<p data-placeholder>Sample run.</p></main>#'
expect_fail stray-illustrative illustrative "" 's#</main>#<div data-illustrative>Illustrative.</div><p>Illustrative numbers.</p></main>#'
expect_fail lede-replaced fixed-copy "" 's#<p class="lede">[^<]*</p>#<p class="lede">Something else.</p>#'
expect_fail dead-anchor anchors "" 's#</main>#<a href="\#nowhere">x</a><span data-id="nowhere"></span></main>#'
expect_fail extra-section sections "" 's#</main>#<section id="extra"></section></main>#'
expect_fail at-mention at-mention "" 's#</main>#<p>Ask @modulestf.</p></main>#'
expect_fail non-ascii ascii "" "s#</main>#<p>a$(printf '\342\200\224')b</p></main>#"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
