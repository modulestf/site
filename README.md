# modules.tf

Source of the modules.tf website: static pages, no build step for the landing page.

`rules/index.html` is generated. Do not edit it by hand: `scripts/build-rules.mjs` builds it from
`rule-facts.md` and `rule-summaries.md` in a checkout of [modulestf/modulestf](https://github.com/modulestf/modulestf),
and the nightly `rules` workflow commits it when it changes. The builder fails, and the page stays
as it was, when the two tables disagree.

```bash
node scripts/build-rules.mjs ../modulestf   # path to a modulestf/modulestf checkout
```

Check the page:

```bash
bash tests/site-test.sh            # structure and copy rules
bash tests/site-test.sh --release  # also fails while any data-placeholder attribute remains
bash tests/site-test-selftest.sh   # proves site-test.sh catches known breaks
bash tests/rules-test.sh           # the rules page builder against a fixture
NODE_PATH=$(npm root -g) node tests/layout-test.mjs  # layout, themes, contrast, targets, focus (Playwright)
```

Licensed under Apache-2.0.
