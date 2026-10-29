#!/bin/bash
# Checks for the modules.tf page. Run: bash tests/site-test.sh [--release]
# --release also fails while any data-placeholder attribute remains.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
page=index.html
fails=0
ok() { echo "ok $1"; }
fail() { echo "FAIL $1: $2"; fails=$((fails + 1)); }

ids=(hero journey different standards run never profiles limits faq coming maintainer feedback footer)
fixed=(
  "Unknown is never a pass"
  "modulestf reviews code your agents write against your project's profile and scope."
  "terraform-skill helps agents write modules; modulestf reviews what they write."
  "Apache-2.0. Runs entirely without compliance.tf; profiles are plain files in your repository."
  "From the maintainer of terraform-aws-modules, terraform-skill and compliance.tf."
  "Profiles shipped: 1"
)

if [ ! -f "$page" ]; then fail page "missing $page"; echo "$fails failed"; exit 1; fi

# sections: every id present, in order
found=$(grep -oE '<section id="[a-z]+"|<footer id="[a-z]+"' "$page" | sed -E 's/.*id="([a-z]+)"/\1/' | tr '\n' ' ')
if [ "$found" = "${ids[*]} " ]; then ok sections; else fail sections "got '$found'"; fi

# ascii: tracked and untracked files, minus .git
bad=$(git ls-files --cached --others --exclude-standard -z | xargs -0 -r env LC_ALL=C grep -lIP '[^\x20-\x7e\t]' 2>/dev/null)
if [ -z "$bad" ]; then ok ascii; else fail ascii "$bad"; fi

# fixed-copy: each string appears verbatim (HTML apostrophe written as ')
missing=""
plain=$(sed -E 's/<[^>]*>//g' "$page")
for s in "${fixed[@]}"; do grep -qF -- "$s" <<<"$plain" || missing="$missing [$s]"; done
# The canonical sentence also sits in the meta description, so check the visible lede itself.
grep -qF -- "<p class=\"lede\">${fixed[1]}</p>" "$page" || missing="$missing [lede]"
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

if [ "${1:-}" = "--release" ]; then
  if grep -qiE 'data-placeholder|placeholder - not a real run|Illustrative' "$page"; then fail release "placeholder review remains"; else ok release; fi
fi

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
