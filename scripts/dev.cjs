const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { ENV_KEYS, PROJECT_DEFAULTS, readFirstTrimmedEnv, setEnvValues } = require('./env.cjs')

function run(command, args, options = {}) {
  const sandboxMode = readFirstTrimmedEnv(ENV_KEYS.sandboxMode) || PROJECT_DEFAULTS.codexRuntime.sandboxMode
  const approvalPolicy = readFirstTrimmedEnv(ENV_KEYS.approvalPolicy) || PROJECT_DEFAULTS.codexRuntime.approvalPolicy
  setEnvValues(ENV_KEYS.sandboxMode, sandboxMode)
  setEnvValues(ENV_KEYS.approvalPolicy, approvalPolicy)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const passthroughArgs = process.argv.slice(2)
const viteBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const vueTscBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vue-tsc.cmd' : 'vue-tsc')

if (!existsSync(viteBinPath) || !existsSync(vueTscBinPath)) {
  const install = spawnSync('pnpm', ['install'], { stdio: 'inherit', env: process.env })
  if (install.error) {
    throw install.error
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1)
  }
}

run(viteBinPath, passthroughArgs)
