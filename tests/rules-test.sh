#!/bin/bash
# Checks scripts/build-rules.mjs against a small fixture checkout. Run: bash tests/rules-test.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fails=0
ok() { echo "ok $1"; }
fail() { echo "FAIL $1: $2"; fails=$((fails + 1)); }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# fixture: a git checkout with the two tables the builder reads
fixture() { # summaries rows (one rule_id per line, "-" for none)
  local d="$tmp/src" ref
  rm -rf "$d"; ref="$d/.agents/skills/terraform-module-reviewer/references"; mkdir -p "$ref"
  cat > "$ref/rule-facts.md" <<'EOF'
| `rule_id` | Carry | `engine` | `severities` |
|-----------|-------|----------|--------------|
| `compat.variable-removed` | never | candidate | CRITICAL, HIGH |
| `review.check-not-run` | never | llm | MEDIUM |
| `review.quoted-claim-unverifiable` | never | llm | none |
EOF
  { printf '| `rule_id` | Summary |\n|---|---|\n'; for id in "$@"; do printf '| `%s` | Text for `%s` & <b>. |\n' "$id" "$id"; done; } > "$ref/rule-summaries.md"
  git -C "$d" init -q && git -C "$d" add -A && git -C "$d" -c user.name=t -c user.email=t@t commit -qm fixture
}
all=(compat.variable-removed review.check-not-run review.quoted-claim-unverifiable)

fixture "${all[@]}"
if node scripts/build-rules.mjs "$tmp/src" "$tmp/out.html" > /dev/null; then
  html=$(cat "$tmp/out.html")
  rows=$(grep -c '<tr id=' <<<"$html")
  if [ "$rows" = 3 ] && grep -qF '<span class="chip sev critical">CRITICAL</span>' <<<"$html" &&
    grep -qF 'Not a finding' <<<"$html" && grep -qF '&amp; &lt;b&gt;' <<<"$html" &&
    grep -qF '<code>compat.variable-removed</code>' <<<"$html" && ! grep -q 'id="structure"' <<<"$html"; then
    ok build
  else fail build "rows=$rows or markup wrong"; fi
else fail build "builder exited non-zero"; fi

fixture compat.variable-removed review.check-not-run
rm -f "$tmp/out.html"
if node scripts/build-rules.mjs "$tmp/src" "$tmp/out.html" 2> "$tmp/err" || [ -e "$tmp/out.html" ]; then
  fail missing-summary "built a page with a rule that has no summary"
elif grep -q 'no row for: review.quoted-claim-unverifiable' "$tmp/err"; then ok missing-summary
else fail missing-summary "$(cat "$tmp/err")"; fi

fixture "${all[@]}" scope.removed
if node scripts/build-rules.mjs "$tmp/src" "$tmp/out.html" 2> "$tmp/err"; then
  fail extra-summary "built a page with a summary for an unknown rule"
elif grep -q 'rows rule-facts.md lacks: scope.removed' "$tmp/err"; then ok extra-summary
else fail extra-summary "$(cat "$tmp/err")"; fi

if [ "$fails" = 0 ]; then echo "all passed"; else echo "$fails failed"; exit 1; fi
