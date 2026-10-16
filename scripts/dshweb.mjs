/**
 * dshweb — run DSH Web from the sandbox, serving the freshly built LearnLoop plugin.
 *
 * Two halves make the latest code run:
 *   - the sandbox's `dsh` comes from npm (nothing on the host provides it),
 *   - the plugin is bind-mounted from this host, so `pnpm run build` here is what
 *     the sandbox loads. Building first is the whole point of this command.
 *
 * The sandbox listens on its own eth0; only the published port is bound on the host,
 * and only on loopback.
 *
 * Usage: dshweb [restart|stop]
 *   (default)  rebuild the plugin, restart DSH Web, print the token URL
 *   stop       stop the running DSH Web and exit
 */
import {execFileSync, execSync} from 'node:child_process'

const SANDBOX = process.env.DSHWEB_SANDBOX ?? 'my-sandbox'
const REPO = process.env.DSHWEB_REPO ?? 'D:/code/learn_dsh'
const WORKDIR = process.env.DSHWEB_WORKDIR ?? '/d/code/learn'
const DSH = process.env.DSHWEB_DSH ?? '/home/agent/dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'
const HOST_PORT = Number(process.env.DSHWEB_PORT ?? 3080)
const GUEST_PORT = Number(process.env.DSHWEB_GUEST_PORT ?? 3080)
const LOG = process.env.DSHWEB_LOG ?? '/tmp/dshweb.log'
// The bracket keeps the pattern from matching the shell that carries it: the process
// list of this very command line shows `[d]sh/...`, which the regex does not match.
const WEB_MATCH = '[d]sh/lib/bin.js web'

const say = text => process.stderr.write(`dshweb: ${text}\n`)
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** Run to completion and return trimmed stdout; a nonzero exit throws. */
const run = (file, args, options = {}) =>
  execFileSync(file, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options}).trim()

const sbx = (...args) => run('sbx', args)
/** Run a shell snippet inside the sandbox. */
const inside = script => sbx('exec', SANDBOX, 'bash', '-lc', script)
const quoted = text => JSON.stringify(text)
const isRunning = () => inside(`pgrep -f ${quoted(WEB_MATCH)} >/dev/null && echo yes || echo no`) === 'yes'

function stop() {
  // `|| true` keeps the exit code zero when nothing matched.
  inside(`pkill -f ${quoted(WEB_MATCH)} || true`)
}

function main() {
  if (process.argv.slice(2).some(arg => !arg.startsWith('-')) && process.argv[2] === 'stop') {
    stop()
    say('stopped')
    return
  }

  say(`building the plugin in ${REPO}`)
  // Windows needs the shell to resolve pnpm.cmd; quote the path so no argument is concatenated raw.
  execSync(process.platform === 'win32' ? `pnpm run build` : 'pnpm run build', {cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32'})

  say(`bringing sandbox ${SANDBOX} up`)
  inside('true')

  // Re-publishing an existing mapping is a conflict, not a failure.
  try {
    sbx('ports', SANDBOX, '--publish', `${HOST_PORT}:${GUEST_PORT}/tcp`)
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`
    if (!/already published/i.test(detail)) throw error
  }

  // Restart by default: the point of this command is serving the build just made, and
  // the printed token belongs to the instance that is actually up.
  if (isRunning()) {
    say('restarting the running DSH Web')
    stop()
    sleep(1500)
  }

  const guest = inside(`node -e "const os=require('os');for(const a of Object.values(os.networkInterfaces()).flat())if(a.family==='IPv4'&&!a.internal){console.log(a.address);break}"`)
  if (!guest) throw new Error('the sandbox has no external IPv4 interface to bind')
  say(`serving on ${guest}:${GUEST_PORT} inside the sandbox`)
  // A bare `sbx exec` tears down its process tree when it returns, so the server is
  // detached with setsid and reparents to the sandbox's init.
  inside(`mkdir -p ${WORKDIR}; cd ${WORKDIR}; : > ${LOG}; `
    + `setsid nohup node ${DSH} web --host ${guest} --port ${GUEST_PORT} --no-open `
    + `--trusted-host 127.0.0.1:${HOST_PORT} >${LOG} 2>&1 </dev/null & echo launched`)

  // The token is minted at startup; wait for the line that carries it.
  let token
  for (let attempt = 0; attempt < 90; attempt++) {
    token = inside(`grep -oE 'token=[A-Za-z0-9_-]+' ${LOG} 2>/dev/null | tail -1 || true`).replace(/^token=/, '')
    if (token) break
    if (attempt > 3 && !isRunning()) {
      throw new Error(`DSH Web exited before printing a token; see ${LOG}\n${inside(`tail -20 ${LOG} || true`)}`)
    }
    sleep(1000)
  }
  if (!token) throw new Error(`no token URL after 90s; see ${LOG}`)
  process.stdout.write(`http://127.0.0.1:${HOST_PORT}/?token=${token}\n`)
}

try {
  main()
} catch (error) {
  say(String(error.message ?? error))
  process.exit(1)
}
