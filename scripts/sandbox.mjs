/**
 * sandbox — shared plumbing for driving the sbx sandbox from the host.
 *
 * Development and testing for this repo happen inside the sandbox, not on this machine:
 * the repo is bind-mounted from Windows over virtiofs, which cannot hold the symlinks
 * pnpm's isolated `node_modules` is made of, and the platform native binaries a Windows
 * install ships are unusable on the Linux side. So the sandbox owns the install, and the
 * host keeps no `node_modules` of its own — `pnpm run dshweb` and `pnpm run sandbox:setup`
 * are the only commands meant to be run from here.
 */
import {execFileSync} from 'node:child_process'

export const SANDBOX = process.env.DSHWEB_SANDBOX ?? 'my-sandbox'
/** The repo path *inside* the sandbox (the host path is a Windows path). */
export const GUEST_REPO = process.env.DSHWEB_GUEST_REPO ?? '/d/code/learn_dsh'
/** On the sandbox's own overlayfs, where symlinks work — never inside the bind mount. */
export const NM_STORE = process.env.DSHWEB_NM_STORE ?? '/home/agent/learnloop-node-modules'

export const say = text => process.stderr.write(`dshweb: ${text}\n`)

/** Run inside the sandbox and return trimmed stdout; a nonzero exit throws. */
export const inside = script =>
  execFileSync('sbx', ['exec', SANDBOX, 'bash', '-lc', script], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
/** Same, but stream the child's output so install and build progress stays visible. */
export const insideVisible = script =>
  execFileSync('sbx', ['exec', SANDBOX, 'bash', '-lc', script], {stdio: ['ignore', 'pipe', 'inherit']})
/** Like `inside`, but returns '' instead of throwing — for "is it there yet" probes. */
export const probe = script => {
  try {
    return inside(script)
  } catch {
    return ''
  }
}

/** Fail fast, before any work, if the sandbox is unreachable. */
export const assertReachable = () => inside('true')

export const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** The filesystem fstype at a guest path, or '' when the path does not exist. */
const filesystemOf = path => probe(`stat -f -c %T ${path} 2>/dev/null`)

/**
 * Make the repo's `node_modules` a directory pnpm can write into.
 *
 * `mount --bind` needs a mountpoint that already exists, and the host's
 * `node_modules` is the obvious one — but bind-mounting over it does not delete it,
 * so a stale Windows install would stay on disk and the mount would hide an empty
 * directory. Clearing the directory first (only when the repo is not already covered
 * by a mount) makes the host share nothing but artifacts.
 */
export function ensureNodeModules() {
  if (filesystemOf(`${GUEST_REPO}/node_modules`) === 'overlayfs') {
    say('node_modules is already a sandbox-local mount')
    return
  }
  say('binding a sandbox-local node_modules over the repo (virtiofs cannot hold symlinks)')
  insideVisible(`
    set -e
    mkdir -p ${NM_STORE}
    sudo mountpoint -q ${GUEST_REPO}/node_modules && sudo umount ${GUEST_REPO}/node_modules || true
    # Whatever is here now is the host's install, which cannot run inside the sandbox.
    sudo rm -rf ${GUEST_REPO}/node_modules
    sudo mkdir -p ${GUEST_REPO}/node_modules
    sudo mount --bind ${NM_STORE} ${GUEST_REPO}/node_modules
    # The bind is owned by root; the sandbox user needs to write the install into it.
    sudo chown "$(id -u):$(id -g)" ${GUEST_REPO}/node_modules
    stat -f -c 'node_modules is now %T' ${GUEST_REPO}/node_modules
  `)
}

/** True when the sandbox already has a usable install. */
export const hasInstall = () => probe(`[ -d ${GUEST_REPO}/node_modules/vitest ] && echo yes || echo no`) === 'yes'

/**
 * Install dependencies inside the sandbox. `CI=true` is required: without it pnpm
 * aborts the modules-dir purge for want of a TTY.
 */
export function installDependencies() {
  say('installing dependencies inside the sandbox')
  insideVisible(`cd ${GUEST_REPO} && CI=true pnpm install --frozen-lockfile`)
}
