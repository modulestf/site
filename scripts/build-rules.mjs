// Builds rules/index.html from a checkout of modulestf/modulestf.
// Run: node scripts/build-rules.mjs <modulestf-checkout> [out]
// Reads the reviewer's rule registry (rule-facts.md) and its plain summaries (rule-summaries.md).
// Exits 1, writing nothing, when the two tables disagree or a value is one this page cannot label.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, out = 'rules/index.html'] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/build-rules.mjs <modulestf-checkout> [out]'); process.exit(2); }
const REF = '.agents/skills/terraform-module-reviewer/references';

// Category order, title and one-line description, keyed by rule_id prefix.
const CATEGORIES = [
  ['compat', 'Compatibility', 'Changes that break existing callers: removed or renamed inputs, newly required inputs, narrowed types, moved resources and raised version floors.'],
  ['coverage', 'Provider schema coverage', 'Arguments, blocks and attributes checked against the provider documentation, at the latest version and at the minimum version the module declares.'],
  ['structure', 'Code structure', 'How the module code is written: types, descriptions, validation, outputs, defaults, comments and file layout.'],
  ['examples', 'Examples', 'Whether the examples run as written and show what the change adds.'],
  ['profile', 'terraform-aws-modules conventions', 'The family layout, generated files, pull request title and release conventions.'],
  ['scope', 'Scope', 'Whether each addition belongs in this module: resource types, providers, files and tooling. A maintainer decides.'],
  ['claim', 'Claims in the pull request', 'Statements in the pull request that verification runs contradict.'],
  ['review', 'Review process', 'What the review could not do. Each is reported as a gap, never counted as a pass.'],
];
const ENGINES = {
  tool: ['Script', 'A deterministic script decides the rule.'],
  candidate: ['Script, then model', 'A script finds candidates with evidence, and the model confirms each one.'],
  llm: ['Model', 'The model judges the rule from the check text.'],
};
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function die(msg) { console.error(`build-rules: ${msg}`); process.exit(1); }
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const unquote = (s) => s.replace(/^`|`$/g, '');
// Rows of the first table whose header starts with `rule_id`, as objects keyed by header cell.
function table(file) {
  const lines = readFileSync(join(src, REF, file), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('| `rule_id` |'));
  if (at < 0) die(`${file}: no table with a rule_id column`);
  const head = cells(lines[at]).map(unquote);
  const rows = [];
  for (const l of lines.slice(at + 2)) {
    if (!l.startsWith('|')) break;
    const c = cells(l);
    if (c.length !== head.length) die(`${file}: row has ${c.length} cells, header has ${head.length}: ${l}`);
    rows.push(Object.fromEntries(head.map((h, i) => [h, h === 'rule_id' ? unquote(c[i]) : c[i]])));
  }
  return rows;
}

const facts = table('rule-facts.md');
const summaries = new Map();
for (const r of table('rule-summaries.md')) {
  if (summaries.has(r.rule_id)) die(`rule-summaries.md: ${r.rule_id} has more than one row`);
  if (!r.Summary) die(`rule-summaries.md: ${r.rule_id} has no summary`);
  summaries.set(r.rule_id, r.Summary);
}
const ids = new Set(facts.map((r) => r.rule_id));
if (ids.size !== facts.length) die('rule-facts.md: a rule_id has more than one row');
const missing = [...ids].filter((id) => !summaries.has(id));
const extra = [...summaries.keys()].filter((id) => !ids.has(id));
if (missing.length) die(`rule-summaries.md has no row for: ${missing.join(', ')}`);
if (extra.length) die(`rule-summaries.md has rows rule-facts.md lacks: ${extra.join(', ')}`);

const rules = facts.map((r) => {
  const cat = r.rule_id.split('.')[0];
  if (!CATEGORIES.some(([k]) => k === cat)) die(`${r.rule_id}: no category for prefix ${cat}`);
  if (!ENGINES[r.engine]) die(`${r.rule_id}: unknown engine ${r.engine}`);
  const sev = r.severities === 'none' ? [] : r.severities.split(',').map((s) => s.trim());
  for (const s of sev) if (!SEVERITIES.includes(s)) die(`${r.rule_id}: unknown severity ${s}`);
  return { id: r.rule_id, cat, engine: r.engine, sev, summary: summaries.get(r.rule_id) };
});

let commit, date;
try {
  [commit, date] = execFileSync('git', ['-C', src, 'log', '-1', '--format=%H%x09%cs'], { encoding: 'utf8' }).trim().split('\t');
} catch { die(`${src}: not a git checkout`); }

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const rank = (r) => (r.sev.length ? SEVERITIES.indexOf(r.sev[0]) : SEVERITIES.length);
const chips = (r) => r.sev.length
  ? r.sev.map((s) => `<span class="chip sev ${s.toLowerCase()}">${s}</span>`).join(' ')
  : '<span class="chip ne">Not a finding</span>';

const sections = CATEGORIES.map(([key, title, desc]) => {
  const rows = rules.filter((r) => r.cat === key).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  if (!rows.length) return '';
  const body = rows.map((r) => `<tr id="${r.id}"><th scope="row"><code>${r.id}</code></th><td>${inline(r.summary)}</td><td class="sevs">${chips(r)}</td><td>${ENGINES[r.engine][0]}</td></tr>`).join('\n');
  return `<section id="${key}" class="band">
<h2>${title} <span class="count">${rows.length}</span></h2>
<p class="wide">${desc}</p>
<div class="tablewrap"><table class="cmp rules">
<thead><tr><th scope="col">Rule</th><th scope="col">What it catches</th><th scope="col">Severity</th><th scope="col">Checked by</th></tr></thead>
<tbody>
${body}
</tbody></table></div>
</section>`;
}).filter(Boolean).join('\n\n');

const toc = CATEGORIES.filter(([k]) => rules.some((r) => r.cat === k))
  .map(([k, t]) => `<a href="#${k}">${t} <span class="count">${rules.filter((r) => r.cat === k).length}</span></a>`).join('\n');
const legend = Object.values(ENGINES).map(([n, d]) => `<li><strong>${n}:</strong> ${d}</li>`).join('\n');
const short = commit.slice(0, 7);
const desc = `The ${rules.length} rules the modules.tf review checks a Terraform module pull request against, by category and severity.`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review rules - modules.tf</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="Review rules - modules.tf">
<meta property="og:description" content="${desc}">
<link rel="icon" type="image/png" href="../assets/icon-256.png">
<link rel="preload" href="../assets/fonts/schibsted-grotesk-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../styles.css">
<script>try{var t=localStorage.getItem("modules-tf-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}document.documentElement.className="js"</script>
<script src="../main.js" defer></script>
<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://plausible.io/js/pa-Qb-xMsa08MHlIw5-Q75Je.js"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>
</head>
<body>
<!-- Generated by scripts/build-rules.mjs from modulestf/modulestf ${commit}. Do not edit by hand. -->
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<a class="brand" href="../" aria-label="modules.tf home"><img src="../assets/mark.svg" alt="" width="34" height="32"><span>modules.tf</span></a>
<nav aria-label="Sections">
<a href="../#journey">Sample</a>
<a href="../#run">Install</a>
<a href="./" aria-current="page">Rules</a>
<a href="../#faq">FAQ</a>
</nav>
</header>

<main id="main">
<section id="intro" class="band">
<h1>Review rules</h1>
<p class="wide">The review checks a pull request to a Terraform module against these ${rules.length} rules, written for the terraform-aws-modules family. A finding takes one of the severities its rule allows, chosen by the case. A rule the review could not check is listed in the review, never counted as a pass.</p>
<nav class="toc" aria-label="Categories">
${toc}
</nav>
<ul class="plain legend">
${legend}
</ul>
</section>

${sections}
</main>

<footer id="footer" class="foot-bar">
<p>Built from <a href="https://github.com/modulestf/modulestf/blob/${commit}/${REF}/rule-facts.md">rule-facts.md</a> and <a href="https://github.com/modulestf/modulestf/blob/${commit}/${REF}/rule-summaries.md">rule-summaries.md</a> at modulestf/modulestf <a href="https://github.com/modulestf/modulestf/commit/${commit}"><code>${short}</code></a> (${date}). Each rule's full text is in its check file.</p>
<p><a href="https://github.com/modulestf/modulestf">GitHub</a> <span aria-hidden="true">/</span> Apache-2.0 <span aria-hidden="true">/</span> Plausible counts visits without cookies.</p>
<button type="button" class="theme" data-theme-toggle aria-label="Switch color theme" hidden></button>
</footer>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`build-rules: ${rules.length} rules from ${short} -> ${out}`);
