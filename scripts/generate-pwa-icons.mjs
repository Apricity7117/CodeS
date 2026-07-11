import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const iconsDir = path.join(rootDir, 'public', 'icons')
const sourceIcon = 'app-icon.png'

const jobs = [
  { outputs: ['pwa-192x192.png', 'codex-fb7299-192x192.png'], size: 192 },
  { outputs: ['pwa-512x512.png', 'codex-fb7299-512x512.png'], size: 512 },
  { outputs: ['apple-touch-icon.png', 'codex-fb7299-180x180.png'], size: 180 },
  { outputs: ['maskable-512x512.png', 'codex-fb7299-maskable-512x512.png'], size: 512 },
]

const sourceBuffer = await readFile(path.join(iconsDir, sourceIcon))
const sourceDataUrl = `data:image/png;base64,${sourceBuffer.toString('base64')}`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.setContent('<!doctype html><html><body></body></html>')

for (const job of jobs) {
  const pngBase64 = await page.evaluate(async ({ sourceDataUrl, size }) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable')

    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load app icon into canvas'))
      img.src = sourceDataUrl
    })

    context.clearRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)

    return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
  }, { sourceDataUrl, size: job.size })

  await Promise.all(
    job.outputs.map((output) => writeFile(path.join(iconsDir, output), Buffer.from(pngBase64, 'base64'))),
  )
}

await browser.close()

console.log('Generated icons:', jobs.flatMap((job) => job.outputs).join(', '))
