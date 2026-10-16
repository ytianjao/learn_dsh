/**
 * sandbox-setup — make the sbx sandbox able to build and test this repo.
 *
 * Development and testing happen inside the sbx sandbox, not on the host. Two
 * properties of the sandbox make a fresh one unable to run anything:
 *
 *   - The repo is bind-mounted from Windows over virtiofs, which does not support
 *     symlinks. pnpm's default isolated `node_modules` is a tree of symlinks, so
 *     `pnpm install` fails with EPERM on the mount.
 *   - A `node_modules` installed on the host is a Windows install: platform native
 *     binaries (rollup, koffi, node-pty) are `.node` files for the wrong OS, so
 *     `vitest` dies with MODULE_NOT_FOUND.
 *
 * The fix is to give the sandbox its own `node_modules` on a filesystem that does
 * support symlinks, and mount it over the repo path. `mount --bind` is permitted
 * in the sandbox and the mount persists for the life of the container.
 *
 * Also installs the packages a test run needs: a Playwright browser (the keyless
 * E2E drives a real browser), CJK fonts (the PDF/EPUB export assertions render
 * Chinese and fail without them), and a few shell tools.
 *
 * Idempotent: every step checks first, so it is safe to re-run after a restart.
 *
 * Usage: node scripts/sandbox-setup.mjs [--force-reinstall]
 */
import {GUEST_REPO, SANDBOX, assertReachable, ensureNodeModules, hasInstall, insideVisible, installDependencies, probe, say} from './sandbox.mjs'

/** apt tools the workflow reaches for, plus the CJK fonts the export assertions need. */
function ensurePackages() {
  const script = `
    set -e
    miss=""
    for t in tmux tree zip fdfind fc-list; do command -v "$t" >/dev/null 2>&1 || miss="$miss $t"; done
    fc-list 2>/dev/null | grep -qi 'noto.*cjk' || miss="$miss fonts-noto-cjk"
    if [ -z "$miss" ]; then echo 'already installed'; exit 0; fi
    echo "installing:$miss"
    sudo apt-get update -qq
    # shellcheck disable=SC2086
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $miss
    # Ubuntu ships the fd binary as fdfind; the tool is normally called fd.
    command -v fd >/dev/null 2>&1 || sudo ln -sf "$(command -v fdfind)" /usr/local/bin/fd
  `
  say('checking sandbox packages (tmux, tree, zip, fd, CJK fonts)')
  insideVisible(script)
}

function ensureBrowser() {
  if (probe('ls ~/.cache/ms-playwright/chromium-* >/dev/null 2>&1 && echo yes || echo no') === 'yes') {
    say('playwright chromium already installed')
    return
  }
  say('installing playwright chromium (~200MB, needs the CDN allowed by sbx policy)')
  // A sandbox policy that denies cdn.playwright.dev fails here; see README "Sandbox (sbx)".
  insideVisible(`cd ${GUEST_REPO} && npx playwright install chromium`)
}

function main() {
  assertReachable() // fail fast if the sandbox is unreachable
  say(`sandbox ${SANDBOX}, repo ${GUEST_REPO}`)
  ensurePackages()
  ensureBrowser()
  ensureNodeModules()
  if (process.argv.includes('--force-reinstall') || !hasInstall()) installDependencies()
  else say('node_modules already populated; pass --force-reinstall to redo it')
  say('ready — run `CI=true pnpm run check` inside the sandbox')
}

try {
  main()
} catch (error) {
  say(String(error.message ?? error))
  process.exit(1)
}
