# Browser-test portability

Set `GIGAS_BROWSER_PATH` or `BROWSER_BIN` to a Chromium-compatible executable and provide one compatible runner. `npm run browser:probe` reports combinations; `npm run test:browser` fails clearly when unavailable. Deterministic smoke tests are not browser tests.
