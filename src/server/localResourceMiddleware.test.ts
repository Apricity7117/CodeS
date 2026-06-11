import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalResourceMiddleware } from './localResourceMiddleware'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'codex-local-resource-'))
})

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

async function createHarness(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const middleware = createLocalResourceMiddleware()
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 204
      res.end()
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

describe('createLocalResourceMiddleware', () => {
  it('passes unmatched requests to the next handler', async () => {
    const { baseUrl, close } = await createHarness()
    try {
      const response = await fetch(`${baseUrl}/not-local-resource`)

      expect(response.status).toBe(204)
    } finally {
      await close()
    }
  })

  it('rejects non-absolute local image paths', async () => {
    const { baseUrl, close } = await createHarness()
    try {
      const response = await fetch(`${baseUrl}/codex-local-image?path=relative.png`)

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Expected absolute local file path.' })
    } finally {
      await close()
    }
  })

  it('serves local images with the expected content type and cache header', async () => {
    const imagePath = join(tempDir, 'image.png')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const { baseUrl, close } = await createHarness()
    try {
      const response = await fetch(`${baseUrl}/codex-local-image?path=${encodeURIComponent(imagePath)}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('private, max-age=300')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    } finally {
      await close()
    }
  })

  it('returns directory listings and honors hidden directory filtering', async () => {
    await mkdir(join(tempDir, 'visible'))
    await mkdir(join(tempDir, '.hidden'))
    const { baseUrl, close } = await createHarness()
    try {
      const query = `path=${encodeURIComponent(tempDir)}`
      const visibleOnly = await fetch(`${baseUrl}/codex-local-directories?${query}`)
      const withHidden = await fetch(`${baseUrl}/codex-local-directories?${query}&showHidden=true`)

      await expect(visibleOnly.json()).resolves.toMatchObject({
        data: {
          entries: [{ name: 'visible', path: join(tempDir, 'visible') }],
        },
      })
      await expect(withHidden.json()).resolves.toMatchObject({
        data: {
          entries: [
            { name: '.hidden', path: join(tempDir, '.hidden') },
            { name: 'visible', path: join(tempDir, 'visible') },
          ],
        },
      })
    } finally {
      await close()
    }
  })

  it('serves browsed local file content', async () => {
    const filePath = join(tempDir, 'note.txt')
    await writeFile(filePath, 'hello from browse', 'utf8')
    const { baseUrl, close } = await createHarness()
    try {
      const response = await fetch(`${baseUrl}/codex-local-browse${encodeURI(filePath)}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      await expect(response.text()).resolves.toBe('hello from browse')
    } finally {
      await close()
    }
  })

  it('writes editable local text files', async () => {
    const filePath = join(tempDir, 'editable.md')
    await writeFile(filePath, 'before', 'utf8')
    const { baseUrl, close } = await createHarness()
    try {
      const response = await fetch(`${baseUrl}/codex-local-edit${encodeURI(filePath)}`, {
        method: 'PUT',
        body: 'after',
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
      await expect(readFile(filePath, 'utf8')).resolves.toBe('after')
    } finally {
      await close()
    }
  })
})
