# Browser automation

No Chromium-compatible binary or browser runner is installed in the current environment. `npm run test:smoke` remains the deterministic source-level smoke suite. `npm run test:browser` checks for `BROWSER_BIN` and fails with an actionable message instead of claiming browser execution. Configure a local Chromium/Playwright or Puppeteer Core runner in a future environment without adding a browser bundle blindly.
