// Layout, theme and accessibility checks for index.html.
// Run: NODE_PATH=$(npm root -g) node tests/layout-test.mjs
// CHROMIUM=/path/to/chrome overrides the browser binary.
// Uses the playwright package; Chromium from CHROMIUM, /opt/pw-browsers, or Playwright's own install.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = pathToFileURL(fileURLToPath(new URL('../index.html', import.meta.url))).href;
const local = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM || (existsSync(local) ? local : undefined);
const browser = await chromium.launch({ executablePath });

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
// Fresh context per case: empty localStorage, no data-theme.
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const p = await ctx.newPage();
  await p.goto(url);
  return { p, ctx };
}

// WCAG relative luminance contrast of two CSS rgb() strings.
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Resolve each token to a computed color, and the colors of real link and button text.
async function palette(p) {
  return p.evaluate(() => {
    const probe = (prop, value) => {
      const el = document.createElement('span');
      el.style[prop] = value;
      document.body.appendChild(el);
      const c = getComputedStyle(el)[prop];
      el.remove();
      return c;
    };
    const tok = (n) => probe('color', `var(--${n})`);
    return {
      paper: getComputedStyle(document.body).backgroundColor,
      ink: tok('ink'), muted: tok('muted'), accentInk: tok('accent-ink'), warn: tok('warn'), good: tok('good'), outline: tok('accent'),
      link: getComputedStyle(document.querySelector('main p:not(.actions) a')).color,
      button: getComputedStyle(document.querySelector('[data-theme-toggle]')).color,
    };
  });
}
function assertContrast(pal, label) {
  for (const k of ['ink', 'muted', 'accentInk', 'warn', 'good', 'link', 'button']) {
    const r = contrast(pal[k], pal.paper);
    assert.ok(r >= 4.5, `${label} ${k} ${r.toFixed(2)} < 4.5`);
  }
  const o = contrast(pal.outline, pal.paper);
  assert.ok(o >= 3, `${label} outline ${o.toFixed(2)} < 3`);
}

for (const width of [320, 375]) {
  await check(`no horizontal scroll at ${width}px`, async () => {
    const { p, ctx } = await page({ viewport: { width, height: 800 } });
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    await ctx.close();
    assert.ok(w <= width, `scrollWidth ${w}`);
  });
}

for (const width of [320, 390]) {
  await check(`hero verdict card content fits inside the card at ${width}px`, async () => {
    const { p, ctx } = await page({ viewport: { width, height: 800 } });
    const bad = await p.evaluate(() => {
      const card = document.querySelector('.hero .verdict');
      const box = card.getBoundingClientRect();
      const out = [];
      if (card.scrollWidth > card.clientWidth) out.push(`card scrollWidth ${card.scrollWidth} > ${card.clientWidth}`);
      for (const el of card.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.right > box.right + 0.5 || r.left < box.left - 0.5) out.push(`${el.tagName} ${el.textContent.trim().slice(0, 30)}`);
      }
      return out;
    });
    await ctx.close();
    assert.deepEqual(bad, []);
  });
}

await check('hero verdict card: verdict line, 1-3 finding rows, evidence, confirm line, review link', async () => {
  const { p, ctx } = await page();
  const c = await p.evaluate(() => {
    const card = document.querySelector('.hero figure.verdict');
    const rows = [...card.querySelectorAll('.vrows li')].map((li) => ({
      chip: !!li.querySelector('.chip.sev'), rule: !!li.querySelector('code'), loc: /:\d+$/.test(li.querySelector('.loc')?.textContent || ''),
    }));
    return {
      v: card.querySelector('.v')?.textContent, rows, text: card.textContent,
      link: card.querySelector('a[href*="terraform-aws-vpc/pull/1270#pullrequestreview-"]') !== null,
    };
  });
  await ctx.close();
  assert.equal(c.v, 'Changes requested before merge.');
  assert.ok(c.rows.length >= 1 && c.rows.length <= 3, `${c.rows.length} rows`);
  assert.ok(c.rows.every((r) => r.chip && r.rule && r.loc), 'each row has a severity chip, a rule ID and file:line');
  assert.ok(c.text.includes('53 not verified'), 'behaviour evidence line');
  assert.ok(c.text.includes('Posts nothing until you confirm.'), 'confirm line');
  assert.ok(c.link, 'link to the posted review');
});

await check('hero CTAs and the whole verdict card above the fold at 1280x800', async () => {
  const { p, ctx } = await page();
  const bottoms = await p.evaluate(() => [
    ...[...document.querySelectorAll('#hero [data-cta]')].map((a) => a.getBoundingClientRect().bottom),
    document.querySelector('.hero .verdict').getBoundingClientRect().bottom,
  ]);
  await ctx.close();
  assert.equal(bottoms.length, 3);
  assert.ok(bottoms.every((b) => b <= 800), `bottoms ${bottoms.map(Math.round)}`);
});

await check('nav links visible at 320px', async () => {
  const { p, ctx } = await page({ viewport: { width: 320, height: 800 } });
  const vis = await p.$$eval('header nav a', (as) => as.map((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right <= window.innerWidth;
  }));
  await ctx.close();
  assert.deepEqual(vis, [true, true, true]);
});

await check('contrast in light theme', async () => {
  const { p, ctx } = await page({ colorScheme: 'light' });
  assertContrast(await palette(p), 'light');
  await ctx.close();
});
await check('contrast in dark theme from OS preference', async () => {
  const { p, ctx } = await page({ colorScheme: 'dark' });
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), undefined);
  assertContrast(await palette(p), 'os-dark');
  await ctx.close();
});
await check('contrast in dark theme from toggle', async () => {
  const { p, ctx } = await page({ colorScheme: 'light' });
  await p.click('[data-theme-toggle]', { timeout: 2000 });
  assertContrast(await palette(p), 'toggle-dark');
  await ctx.close();
});

for (const scheme of ['light', 'dark']) {
  await check(`toggle overrides OS ${scheme} and label names the other theme`, async () => {
    const { p, ctx } = await page({ colorScheme: scheme });
    const other = scheme === 'light' ? 'dark' : 'light';
    const btn = p.locator('[data-theme-toggle]');
    const cap = (t) => t[0].toUpperCase() + t.slice(1);
    assert.equal(await btn.textContent(), cap(other));
    assert.equal(await btn.getAttribute('aria-label'), `Switch to ${other} theme`);
    const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await btn.click({ timeout: 2000 });
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), other);
    assert.equal(await btn.textContent(), cap(scheme));
    assert.equal(await btn.getAttribute('aria-label'), `Switch to ${scheme} theme`);
    assert.notEqual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), before);
    await ctx.close();
  });
}

await check('toggle label updates when storage write throws', async () => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  await ctx.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('quota'); };
  });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.click('[data-theme-toggle]', { timeout: 2000 });
  assert.equal(await p.locator('[data-theme-toggle]').textContent(), 'Light');
  assert.equal(await p.locator('[data-theme-toggle]').getAttribute('aria-label'), 'Switch to light theme');
  await ctx.close();
});

await check('target sizes: CTAs 44x44, other controls 24x24', async () => {
  const { p, ctx } = await page();
  const small = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a, button')) {
      if (el.offsetParent === null) continue;
      // WCAG 2.5.8 inline exception: a link inside a sentence is sized by its line.
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li, dd, td, figcaption')) continue;
      const r = el.getBoundingClientRect();
      const min = el.hasAttribute('data-cta') ? 44 : 24;
      if (r.width < min || r.height < min) out.push(`${el.textContent.trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  await ctx.close();
  assert.deepEqual(small, []);
});

await check('every control reached by Tab shows a focus outline', async () => {
  const { p, ctx } = await page();
  const total = await p.$$eval('a, button', (els) => els.filter((e) => e.offsetParent !== null).length);
  const missing = [];
  for (let i = 0; i < total; i++) {
    await p.keyboard.press('Tab');
    const r = await p.evaluate(() => {
      const el = document.activeElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, text: el.textContent.trim().slice(0, 30), ok: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 };
    });
    if (!r.ok) missing.push(`${r.tag} ${r.text}`);
  }
  await ctx.close();
  assert.deepEqual(missing, []);
});

await check('without JavaScript the toggle is hidden and not tabbable', async () => {
  const { p, ctx } = await page({ javaScriptEnabled: false });
  const btn = p.locator('[data-theme-toggle]');
  assert.equal(await btn.isVisible(), false);
  const total = await p.$$eval('a, button', (els) => els.length);
  for (let i = 0; i < total; i++) {
    await p.keyboard.press('Tab');
    assert.notEqual(await p.evaluate(() => document.activeElement.hasAttribute('data-theme-toggle')), true);
  }
  await ctx.close();
});

await check('semantics: one h1, landmarks, lang, title', async () => {
  const { p, ctx } = await page();
  const s = await p.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.lang,
    title: document.title,
    header: !!document.querySelector('header'), main: !!document.querySelector('main'), footer: !!document.querySelector('footer'),
  }));
  await ctx.close();
  assert.equal(s.h1, 1);
  assert.equal(s.lang, 'en');
  assert.equal(s.title, 'modules.tf - review Terraform module pull requests against written rules');
  assert.ok(s.header && s.main && s.footer, 'landmarks');
});

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
