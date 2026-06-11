import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import {
  createDirectoryListingHtml,
  createTextEditorHtml,
  decodeBrowsePath,
  getLocalDirectoryListing,
  isTextEditableFile,
  normalizeLocalPath,
} from './localBrowseUi.js'

export type LocalResourceNext = (error?: unknown) => void

export type LocalResourceMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: LocalResourceNext,
) => void

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const LOCAL_FILE_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.text': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
}

function getLocalFileContentType(localPath: string): string | undefined {
  return LOCAL_FILE_CONTENT_TYPES[extname(localPath).toLowerCase()]
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function setHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

function normalizeLocalImagePath(rawPath: string): string {
  return normalizeLocalPath(rawPath)
}

function isTruthyQueryFlag(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase())
}

function streamLocalFile(
  res: ServerResponse,
  localPath: string,
  options: {
    contentType?: string
    cacheControl?: string
    contentDisposition?: string
    notFoundMessage: string
  },
): void {
  res.statusCode = 200
  if (options.contentType) res.setHeader('Content-Type', options.contentType)
  if (options.cacheControl) res.setHeader('Cache-Control', options.cacheControl)
  if (options.contentDisposition) res.setHeader('Content-Disposition', options.contentDisposition)

  const stream = createReadStream(localPath)
  stream.on('error', () => {
    if (res.headersSent) return
    setJson(res, 404, { error: options.notFoundMessage })
  })
  stream.pipe(res)
}

async function handleLocalImage(url: URL, res: ServerResponse): Promise<void> {
  const localPath = normalizeLocalImagePath(url.searchParams.get('path') ?? '')
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local file path.' })
    return
  }

  const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()]
  if (!contentType) {
    setJson(res, 415, { error: 'Unsupported image type.' })
    return
  }

  streamLocalFile(res, localPath, {
    contentType,
    cacheControl: 'private, max-age=300',
    notFoundMessage: 'Image file not found.',
  })
}

async function handleLocalFile(url: URL, res: ServerResponse): Promise<void> {
  const localPath = normalizeLocalPath(url.searchParams.get('path') ?? '')
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local file path.' })
    return
  }

  streamLocalFile(res, localPath, {
    contentType: getLocalFileContentType(localPath),
    cacheControl: 'private, no-store',
    contentDisposition: `inline; filename="${basename(localPath)}"`,
    notFoundMessage: 'File not found.',
  })
}

async function handleLocalDirectories(url: URL, res: ServerResponse): Promise<void> {
  const localPath = normalizeLocalPath(url.searchParams.get('path') ?? '')
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local directory path.' })
    return
  }

  try {
    const fileStat = await stat(localPath)
    if (!fileStat.isDirectory()) {
      setJson(res, 400, { error: 'Expected directory path.' })
      return
    }

    const data = await getLocalDirectoryListing(localPath, {
      showHidden: isTruthyQueryFlag(url.searchParams.get('showHidden')),
    })
    setJson(res, 200, { data })
  } catch {
    setJson(res, 404, { error: 'Directory not found.' })
  }
}

async function handleLocalBrowse(url: URL, res: ServerResponse): Promise<void> {
  const localPath = decodeBrowsePath(url.pathname.slice('/codex-local-browse'.length))
  const newProjectName = url.searchParams.get('newProjectName') ?? ''
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local file path.' })
    return
  }

  try {
    const fileStat = await stat(localPath)
    res.setHeader('Cache-Control', 'private, no-store')
    if (fileStat.isDirectory()) {
      setHtml(res, 200, await createDirectoryListingHtml(localPath, { newProjectName }))
      return
    }

    streamLocalFile(res, localPath, {
      contentType: getLocalFileContentType(localPath),
      notFoundMessage: 'File not found.',
    })
  } catch {
    setJson(res, 404, { error: 'File not found.' })
  }
}

async function handleLocalEditGet(url: URL, res: ServerResponse): Promise<void> {
  const localPath = decodeBrowsePath(url.pathname.slice('/codex-local-edit'.length))
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local file path.' })
    return
  }

  try {
    const fileStat = await stat(localPath)
    if (!fileStat.isFile()) {
      setJson(res, 400, { error: 'Expected file path.' })
      return
    }

    setHtml(res, 200, await createTextEditorHtml(localPath))
  } catch {
    setJson(res, 404, { error: 'File not found.' })
  }
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleLocalEditPut(req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> {
  const localPath = decodeBrowsePath(url.pathname.slice('/codex-local-edit'.length))
  if (!localPath || !isAbsolute(localPath)) {
    setJson(res, 400, { error: 'Expected absolute local file path.' })
    return
  }
  if (!(await isTextEditableFile(localPath))) {
    setJson(res, 415, { error: 'Only text-like files are editable.' })
    return
  }

  try {
    const body = await readRequestBody(req)
    await writeFile(localPath, body.toString('utf8'), 'utf8')
    setJson(res, 200, { ok: true })
  } catch {
    setJson(res, 404, { error: 'File not found.' })
  }
}

export function createLocalResourceMiddleware(): LocalResourceMiddleware {
  return (req, res, next) => {
    if (!req.url) {
      next()
      return
    }

    const method = req.method ?? 'GET'
    const url = new URL(req.url, 'http://localhost')

    const run = async (): Promise<boolean> => {
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/codex-local-image') {
        await handleLocalImage(url, res)
        return true
      }
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/codex-local-file') {
        await handleLocalFile(url, res)
        return true
      }
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/codex-local-directories') {
        await handleLocalDirectories(url, res)
        return true
      }
      if ((method === 'GET' || method === 'HEAD') && url.pathname.startsWith('/codex-local-browse/')) {
        await handleLocalBrowse(url, res)
        return true
      }
      if ((method === 'GET' || method === 'HEAD') && url.pathname.startsWith('/codex-local-edit/')) {
        await handleLocalEditGet(url, res)
        return true
      }
      if (method === 'PUT' && url.pathname.startsWith('/codex-local-edit/')) {
        await handleLocalEditPut(req, url, res)
        return true
      }
      return false
    }

    run()
      .then((handled) => {
        if (!handled) next()
      })
      .catch((error: unknown) => {
        next(error)
      })
  }
}
