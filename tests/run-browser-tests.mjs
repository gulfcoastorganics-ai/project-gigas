import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const candidates = [process.env.GIGAS_BROWSER_PATH, process.env.BROWSER_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/firefox'].filter(Boolean)
const browser = candidates.find((candidate) => fs.existsSync(candidate))
const runner = ['playwright', 'puppeteer', 'puppeteer-core'].find((name) => fs.existsSync(`node_modules/${name}`))
if (!browser || !runner) {
  console.error('BROWSER TESTS BLOCKED: no compatible browser binary and runner are installed.')
  console.error('Set BROWSER_BIN and provide Playwright or Puppeteer Core in a test environment, then rerun npm run test:browser.')
  process.exit(2)
}
console.log(`Browser runner detected (${runner}, ${browser}), but no adapter-specific runner is configured yet.`)
try { execFileSync(browser, ['--version'], { stdio: 'inherit' }) } catch { process.exit(2) }
