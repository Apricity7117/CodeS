import { spawn } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { canRunCommand, prependPathEntry } from '../commandResolution.js'
import { ENV_KEYS, readTrimmedEnv } from '../config/env.js'

let hasPromptedCloudflaredInstall = false

function getCodexHomePath(): string {
  return readTrimmedEnv(ENV_KEYS.codexHome[0]) || join(homedir(), '.codex')
}

function getCloudflaredPromptMarkerPath(): string {
  return join(getCodexHomePath(), '.cloudflared-install-prompted')
}

function hasPromptedCloudflaredInstallPersisted(): boolean {
  return existsSync(getCloudflaredPromptMarkerPath())
}

async function persistCloudflaredInstallPrompted(): Promise<void> {
  const codexHome = getCodexHomePath()
  mkdirSync(codexHome, { recursive: true })
  await writeFile(getCloudflaredPromptMarkerPath(), `${Date.now()}\n`, 'utf8')
}

function resolveCloudflaredCommand(): string | null {
  if (canRunCommand('cloudflared', ['--version'])) {
    return 'cloudflared'
  }
  const localCandidate = join(homedir(), '.local', 'bin', 'cloudflared')
  if (existsSync(localCandidate) && canRunCommand(localCandidate, ['--version'])) {
    return localCandidate
  }
  return null
}

function mapCloudflaredLinuxArch(arch: NodeJS.Architecture): string | null {
  if (arch === 'x64') {
    return 'amd64'
  }
  if (arch === 'arm64') {
    return 'arm64'
  }
  return null
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string) => {
      httpsGet(currentUrl, (response) => {
        const code = response.statusCode ?? 0
        if (code >= 300 && code < 400 && response.headers.location) {
          response.resume()
          request(response.headers.location)
          return
        }
        if (code !== 200) {
          response.resume()
          reject(new Error(`Download failed with HTTP status ${String(code)}`))
          return
        }
        const file = createWriteStream(destination, { mode: 0o755 })
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
      }).on('error', reject)
    }

    request(url)
  })
}

async function ensureCloudflaredInstalledLinux(): Promise<string | null> {
  const current = resolveCloudflaredCommand()
  if (current) {
    return current
  }
  if (process.platform !== 'linux') {
    return null
  }

  const mappedArch = mapCloudflaredLinuxArch(process.arch)
  if (!mappedArch) {
    throw new Error(`cloudflared auto-install is not supported for Linux architecture: ${process.arch}`)
  }

  const userBinDir = join(homedir(), '.local', 'bin')
  mkdirSync(userBinDir, { recursive: true })
  const destination = join(userBinDir, 'cloudflared')
  const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${mappedArch}`

  console.log('\ncloudflared not found. Installing to ~/.local/bin...\n')
  await downloadFile(downloadUrl, destination)
  chmodSync(destination, 0o755)
  process.env.PATH = prependPathEntry(process.env.PATH ?? '', userBinDir)

  const installed = resolveCloudflaredCommand()
  if (!installed) {
    throw new Error('cloudflared download completed but executable is still not available')
  }
  console.log('\ncloudflared installed.\n')
  return installed
}

async function shouldInstallCloudflaredInteractively(): Promise<boolean> {
  if (hasPromptedCloudflaredInstall || hasPromptedCloudflaredInstallPersisted()) {
    return false
  }
  hasPromptedCloudflaredInstall = true
  await persistCloudflaredInstallPrompted()

  if (process.platform === 'win32') {
    return false
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.warn('\n[cloudflared] cloudflared is missing and terminal is non-interactive, skipping install.')
    return false
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question('cloudflared is not installed. Install it now to ~/.local/bin? [y/N] ')
    const normalized = answer.trim().toLowerCase()
    return normalized === 'y' || normalized === 'yes'
  } finally {
    prompt.close()
  }
}

export async function resolveCloudflaredForTunnel(): Promise<string | null> {
  const current = resolveCloudflaredCommand()
  if (current) {
    return current
  }

  if (process.platform === 'win32') {
    return null
  }

  const installApproved = await shouldInstallCloudflaredInteractively()
  if (!installApproved) {
    return null
  }

  return ensureCloudflaredInstalledLinux()
}

function parseCloudflaredUrl(chunk: string): string | null {
  const urlMatch = chunk.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g)
  if (!urlMatch || urlMatch.length === 0) {
    return null
  }
  return urlMatch[urlMatch.length - 1] ?? null
}

function isTailscaleIPv4Address(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number.parseInt(part, 10))
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return false
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
}

function isTailscaleIPv6Address(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized.startsWith('fd7a:115c:a1e0:')
}

export function hasDetectedTailscaleIp(): boolean {
  try {
    const interfaces = networkInterfaces()
    for (const entries of Object.values(interfaces)) {
      if (!entries) continue
      for (const entry of entries) {
        if (entry.internal) continue
        if (entry.family === 'IPv4' && isTailscaleIPv4Address(entry.address)) return true
        if (entry.family === 'IPv6' && isTailscaleIPv6Address(entry.address)) return true
      }
    }
  } catch {}
  return false
}

export async function startCloudflaredTunnel(command: string, localPort: number): Promise<{
  process: ReturnType<typeof spawn>
  url: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['tunnel', '--url', `http://localhost:${String(localPort)}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Timed out waiting for cloudflared tunnel URL'))
    }, 20000)

    const handleData = (value: Buffer | string) => {
      const text = String(value)
      const parsedUrl = parseCloudflaredUrl(text)
      if (!parsedUrl) {
        return
      }
      clearTimeout(timeout)
      child.stdout?.off('data', handleData)
      child.stderr?.off('data', handleData)
      resolve({ process: child, url: parsedUrl })
    }

    const onError = (error: Error) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start cloudflared: ${error.message}`))
    }

    child.once('error', onError)
    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    child.once('exit', (code) => {
      if (code === 0) {
        return
      }
      clearTimeout(timeout)
      reject(new Error(`cloudflared exited before providing a URL (code ${String(code)})`))
    })
  })
}
