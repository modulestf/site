# modules.tf

Source of the modules.tf website: one static page, no build step.

Check the page:

```bash
bash tests/site-test.sh            # structure and copy rules
bash tests/site-test.sh --release  # also fails while the hero review is a placeholder
bash tests/site-test-selftest.sh   # proves site-test.sh catches known breaks
NODE_PATH=$(npm root -g) node tests/layout-test.mjs  # layout, themes, contrast, targets, focus (Playwright)
```

Licensed under Apache-2.0.
