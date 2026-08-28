import { describe, expect, it } from 'vitest'
import { resolveTerminalInvocation } from './openTerminal'

const CWD = '/tmp/example-project'

describe('resolveTerminalInvocation', () => {
  it('macOS 使用 open -a Terminal 打开目录', () => {
    expect(resolveTerminalInvocation(CWD, { platform: 'darwin' })).toEqual({
      command: 'open',
      args: ['-a', 'Terminal', CWD],
      cwd: CWD,
    })
  })

  it('Windows 优先使用 wt -d', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'win32',
        isCommandAvailable: (command) => command === 'wt',
      }),
    ).toEqual({ command: 'wt', args: ['-d', CWD], cwd: CWD })
  })

  it('Windows 无 wt 时回退 cmd start，靠 spawn cwd 定位目录', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'win32',
        isCommandAvailable: () => false,
      }),
    ).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', 'cmd'], cwd: CWD })
  })

  it('Linux 按顺序探测常见终端并以目标目录为工作目录', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'linux',
        isCommandAvailable: (command) => command === 'konsole' || command === 'xterm',
      }),
    ).toEqual({ command: 'konsole', args: [], cwd: CWD })
  })

  it('Linux 无可用终端时返回 null', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'linux',
        isCommandAvailable: () => false,
      }),
    ).toBeNull()
  })

  it('覆盖命令无占位符时把目录追加为最后一个参数', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'darwin',
        overrideCommand: 'open -a iTerm',
      }),
    ).toEqual({ command: 'open', args: ['-a', 'iTerm', CWD], cwd: CWD })
  })

  it('覆盖命令支持 {dir} 占位符替换', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'linux',
        overrideCommand: 'kitty --directory={dir}',
      }),
    ).toEqual({ command: 'kitty', args: [`--directory=${CWD}`], cwd: CWD })
  })

  it('覆盖命令优先于平台默认策略', () => {
    expect(
      resolveTerminalInvocation(CWD, {
        platform: 'win32',
        overrideCommand: 'alacritty --working-directory {dir}',
        isCommandAvailable: (command) => command === 'wt',
      }),
    ).toEqual({ command: 'alacritty', args: ['--working-directory', CWD], cwd: CWD })
  })

  it('空白覆盖命令按未设置处理', () => {
    expect(
      resolveTerminalInvocation(CWD, { platform: 'darwin', overrideCommand: '   ' }),
    ).toEqual({ command: 'open', args: ['-a', 'Terminal', CWD], cwd: CWD })
  })
})
