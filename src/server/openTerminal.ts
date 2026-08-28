import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { ENV_KEYS, readFirstTrimmedEnv } from '../config/env.js'

/** 终端拉起调用描述：命令、参数与工作目录 */
export type TerminalInvocation = {
  command: string
  args: string[]
  cwd: string
}

type ResolveTerminalOptions = {
  platform?: NodeJS.Platform
  overrideCommand?: string
  isCommandAvailable?: (command: string) => boolean
}

const TERMINAL_DIR_PLACEHOLDER = '{dir}'

const LINUX_TERMINAL_CANDIDATES = [
  'x-terminal-emulator',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'xterm',
]

function isExecutableOnPath(command: string): boolean {
  if (isAbsolute(command)) return existsSync(command)
  const pathValue = process.env.PATH ?? ''
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : ['']
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue
    for (const ext of extensions) {
      try {
        accessSync(join(dir, `${command}${ext}`), constants.X_OK)
        return true
      } catch {
        // 不可执行或不存在，继续探测
      }
    }
  }
  return false
}

function buildOverrideInvocation(overrideCommand: string, cwd: string): TerminalInvocation | null {
  const tokens = overrideCommand.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  let replaced = false
  const substituted = tokens.map((token) => {
    if (!token.includes(TERMINAL_DIR_PLACEHOLDER)) return token
    replaced = true
    return token.replaceAll(TERMINAL_DIR_PLACEHOLDER, cwd)
  })
  const [command, ...args] = substituted
  if (!replaced) args.push(cwd)
  return { command, args, cwd }
}

/**
 * 解析在指定目录打开系统终端的命令。
 *
 * 优先使用覆盖命令（`CODES_TERMINAL_COMMAND`，支持 `{dir}` 占位符，
 * 无占位符时把目录追加为最后一个参数）；否则按平台内置策略：
 * macOS 用 `open -a Terminal`，Windows 优先 `wt` 回退 `cmd`，
 * Linux 依次探测常见终端并以目标目录为工作目录启动。
 *
 * Args:
 *   cwd: 终端要打开的目录（绝对路径）。
 *   options: 平台、覆盖命令与命令可用性探测函数（测试注入用）。
 *
 * Returns:
 *   可直接 spawn 的调用描述；无可用终端时返回 null。
 */
export function resolveTerminalInvocation(
  cwd: string,
  options: ResolveTerminalOptions = {},
): TerminalInvocation | null {
  const platform = options.platform ?? process.platform
  const isCommandAvailable = options.isCommandAvailable ?? isExecutableOnPath
  const overrideCommand = options.overrideCommand?.trim() ?? ''

  if (overrideCommand) {
    return buildOverrideInvocation(overrideCommand, cwd)
  }

  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Terminal', cwd], cwd }
  }

  if (platform === 'win32') {
    if (isCommandAvailable('wt')) {
      return { command: 'wt', args: ['-d', cwd], cwd }
    }
    // start 的第一个引号参数是窗口标题，空串占位；新 cmd 窗口继承 spawn cwd
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', 'cmd'], cwd }
  }

  for (const candidate of LINUX_TERMINAL_CANDIDATES) {
    if (isCommandAvailable(candidate)) {
      return { command: candidate, args: [], cwd }
    }
  }
  return null
}

/**
 * 在指定目录拉起系统默认终端。
 *
 * Args:
 *   cwd: 已校验存在的项目目录绝对路径。
 *
 * Raises:
 *   Error: 未找到可用终端，或终端进程拉起失败。
 */
export async function openTerminalAtDirectory(cwd: string): Promise<void> {
  const invocation = resolveTerminalInvocation(cwd, {
    overrideCommand: readFirstTrimmedEnv(ENV_KEYS.terminalCommand ?? []),
  })
  if (!invocation) {
    throw new Error('No terminal emulator found. Set CODES_TERMINAL_COMMAND to your terminal command.')
  }
  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    detached: true,
    stdio: 'ignore',
  })
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('spawn', resolvePromise)
  })
  child.unref()
}
