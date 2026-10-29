#!/bin/bash
# Mutates temporary copies of the site and confirms tests/site-test.sh catches each break.
# Run: bash tests/site-test-selftest.sh
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
fails=0

# case name, expected failing check, extra site-test argument, sed expression applied to index.html
expect_fail() {
  local name="$1" check="$2" arg="$3" expr="$4" dir="$TMP/$1"
  mkdir -p "$dir/tests"
  cp "$SRC/index.html" "$dir/"
  cp "$SRC/tests/site-test.sh" "$dir/tests/"
  git -C "$dir" init -q
  sed -i -E "$expr" "$dir/index.html"
  git -C "$dir" add -A
  local out
  out=$(bash "$dir/tests/site-test.sh" $arg)
  if grep -q "^FAIL $check" <<<"$out"; then
    echo "ok $name"
  else
    echo "FAIL $name: site-test.sh did not report $check"; echo "$out" | sed 's/^/  | /'; fails=$((fails + 1))
  fi
}

expect_fail hype-phrase banned-words "" 's#<p class="lede">#<p>A game changer that leverages AI to unlock powerful reviews.</p><p class="lede">#'
expect_fail placeholder-text-left release --release 's/ data-placeholder//'
expect_fail lede-replaced fixed-copy "" 's#<p class="lede">[^<]*</p>#<p class="lede">Something else.</p>#'
expect_fail dead-anchor anchors "" 's#</main>#<a href="\#nowhere">x</a><span data-id="nowhere"></span></main>#'

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
