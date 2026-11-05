#!/bin/bash
# Checks for the modules.tf page. Run: bash tests/site-test.sh [--release]
# --release also fails while any data-placeholder attribute remains.
# Always: the word "Illustrative" may appear only inside the element marked data-illustrative.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
page=index.html
fails=0
ok() { echo "ok $1"; }
fail() { echo "FAIL $1: $2"; fails=$((fails + 1)); }

ids=(hero who journey standards different never run status faq footer)
fixed=(
  "Review Terraform module pull requests against written rules"
  "Agent skills for Claude Code and Codex. They check a change to a reusable module rule by rule against the terraform-aws-modules review rules: breaking changes, provider-schema coverage, and whether each addition belongs. Every rule they could not check is listed, never counted as a pass."
  "From the maintainer of terraform-aws-modules. Apache-2.0."
  "For maintainers of reusable Terraform modules who review pull requests against the terraform-aws-modules rules, including pull requests written by other people's agents."
  "It applies one profile today: the terraform-aws-modules rules. It does not apply your internal standards; other profiles need changes to the skills and are future work."
  "Not for root configurations or live stacks."
  "No account or hosted service. The profile is plain files in the modulestf repository; you can read every rule."
  "A module's docs/SCOPE.md, read from the base branch, can only allow or deny resource types and providers. Scanner, test and layout rules have no per-module exception."
  "From the maintainer of terraform-aws-modules, terraform-skill and compliance.tf."
)

if [ ! -f "$page" ]; then fail page "missing $page"; echo "$fails failed"; exit 1; fi

# sections: every id present, in order
found=$(grep -oE '<section id="[a-z]+"|<footer id="[a-z]+"' "$page" | sed -E 's/.*id="([a-z]+)"/\1/' | tr '\n' ' ')
if [ "$found" = "${ids[*]} " ]; then ok sections; else fail sections "got '$found'"; fi

# ascii: tracked and untracked files, minus .git
bad=$(git ls-files --cached --others --exclude-standard -z | xargs -0 env LC_ALL=C grep -lI $'[^\t -~]')
if [ -z "$bad" ]; then ok ascii; else fail ascii "$bad"; fi

# fixed-copy: each string appears verbatim (HTML apostrophe written as ')
missing=""
plain=$(sed -E 's/<[^>]*>//g' "$page")
for s in "${fixed[@]}"; do grep -qF -- "$s" <<<"$plain" || missing="$missing [$s]"; done
# Check the visible h1 and lede elements themselves, not just the text somewhere on the page.
grep -qF -- "<h1>${fixed[0]}</h1>" "$page" || missing="$missing [h1]"
# The lede may carry links; compare its text.
grep '<p class="lede">' "$page" | sed -E 's/<[^>]*>//g' | grep -qxF -- "${fixed[1]}" || missing="$missing [lede]"
if [ -z "$missing" ]; then ok fixed-copy; else fail fixed-copy "$missing"; fi

# hero-actions: exactly two data-cta links, no waitlist link inside hero
hero=$(awk '/<section id="hero"/{f=1} f{print} f&&/<\/section>/{exit}' "$page")
ctas=$(grep -o 'data-cta' <<<"$hero" | wc -l)
if [ "$ctas" -eq 2 ] && ! grep -q 'data-waitlist' <<<"$hero"; then ok hero-actions; else fail hero-actions "cta=$ctas or waitlist in hero"; fi

# at-mention: @modulestf only inside <code>
stray=$(sed -E 's#<code>[^<]*</code>##g' "$page" | grep -n '@modulestf')
if [ -z "$stray" ]; then ok at-mention; else fail at-mention "$stray"; fi

# banned-words
hype=$(grep -niE 'revolutionary|seamless|effortless|game[- ]?changer|cutting[- ]edge|world[- ]class|best[- ]in[- ]class|supercharge|10x|trusted by|leverag|unlock|powerful|empower|blazing|next[- ]gen|ai[- ]powered|magic' "$page")
if [ -z "$hype" ]; then ok banned-words; else fail banned-words "$hype"; fi

# anchors: every href="#x" has id="x"
dead=""
for a in $(grep -oE 'href="#[A-Za-z0-9_-]+"' "$page" | sed -E 's/href="#(.*)"/\1/' | sort -u); do
  grep -qE "[[:space:]]id=\"$a\"" "$page" || dead="$dead $a"
done
if [ -z "$dead" ]; then ok anchors; else fail anchors "$dead"; fi

# illustrative: cut each element marked data-illustrative, to its matching close tag, then the word must be gone
outside=$(perl -e '
  undef $/; $_ = <>;
  while (/<([a-z0-9]+)\b[^>]*\bdata-illustrative\b[^>]*>/) {
    my ($tag, $start) = ($1, $-[0]); pos($_) = $+[0]; my $d = 1;
    while ($d && /<(\/?)\Q$tag\E\b[^>]*>/g) { $d += $1 ? -1 : 1 }
    my $end = $d ? length($_) : pos($_);
    substr($_, $start, $end - $start) = "";
  }
  print;
' "$page" | grep -iE 'illustrative')
if [ -z "$outside" ]; then ok illustrative; else fail illustrative "$outside"; fi

if [ "${1:-}" = "--release" ]; then
  if grep -qiE 'data-placeholder|placeholder - not a real run' "$page"; then fail release "placeholder review remains"; else ok release; fi
fi

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
