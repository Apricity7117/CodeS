#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import vm from 'node:vm'

const defaultSourceDir = '/Users/a/Projects/js/anti-codex/src/webview/assets'
const rootDir = resolve(new URL('..', import.meta.url).pathname)
const defaultOutputDir = join(rootDir, 'src', 'components', 'icons', 'codex')

const args = parseArgs(process.argv.slice(2))
const sourceDir = resolve(args.sourceDir ?? defaultSourceDir)
const outputDir = resolve(args.outputDir ?? defaultOutputDir)
const dryRun = args.dryRun

if (!existsSync(sourceDir)) {
  throw new Error(`找不到来源目录：${sourceDir}`)
}

const entries = []
const componentNames = new Set()

for (const fileName of readdirSync(sourceDir).sort()) {
  if (!fileName.endsWith('.js')) continue

  const sourcePath = join(sourceDir, fileName)
  const source = readFileSync(sourcePath, 'utf8')
  if (!source.includes('`svg`') && !source.includes('"svg"') && !source.includes("'svg'")) continue
  if (!isCandidateIconModule(source)) continue

  const extracted = safeExtractSvgExports(source, fileName)
  for (const [index, item] of extracted.entries()) {
    const baseName = toPascalCase(stripHash(fileName.replace(/\.js$/u, ''))) || 'Icon'
    const suffix = extracted.length > 1 && index > 0 ? String(index + 1) : ''
    const rawComponentName = `IconCodex${baseName}${suffix}`
    const componentName = uniqueComponentName(rawComponentName, componentNames)

    entries.push({
      componentName,
      exportName: item.exportName,
      sourceFile: fileName,
      svg: item.svg,
    })
  }
}

if (!dryRun) {
  rmSync(outputDir, { force: true, recursive: true })
  mkdirSync(outputDir, { recursive: true })

  for (const entry of entries) {
    writeFileSync(
      join(outputDir, `${entry.componentName}.vue`),
      renderVueComponent(entry.svg),
    )
  }

  writeFileSync(join(outputDir, 'index.ts'), renderIndex(entries))
  writeFileSync(join(outputDir, 'manifest.ts'), renderManifest(entries))
}

console.log(`来源目录：${sourceDir}`)
console.log(`输出目录：${outputDir}`)
console.log(`识别图标：${entries.length}`)
if (dryRun) {
  for (const entry of entries) {
    console.log(`${entry.componentName} <= ${entry.sourceFile}#${entry.exportName}`)
  }
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    outputDir: undefined,
    sourceDir: undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--source-dir') {
      parsed.sourceDir = argv[index + 1]
      index += 1
    } else if (arg === '--output-dir') {
      parsed.outputDir = argv[index + 1]
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }

  return parsed
}

function printHelp() {
  console.log(`Usage: node scripts/extract-codex-icons.mjs [options]

Options:
  --source-dir <path>   anti-codex webview assets 目录
  --output-dir <path>   CodeS 图标输出目录
  --dry-run             只打印可抽取图标，不写入文件
  -h, --help            显示帮助
`)
}

function extractSvgExports(source, fileName) {
  const exportPairs = parseNamedExports(source)
  if (exportPairs.length === 0) return []

  const runnableSource = transformModuleSource(source)
  const sandbox = createSandbox()

  try {
    vm.runInNewContext(runnableSource, sandbox, {
      filename: fileName,
      timeout: 300,
    })
  } catch {
    return []
  }

  const results = []
  for (const pair of exportPairs) {
    const value = sandbox.__exports[pair.exported]
    if (typeof value !== 'function') continue
    if (value.constructor?.name === 'AsyncFunction' || value.length > 1) continue

    try {
      const rendered = value({})
      if (rendered && typeof rendered.then === 'function') {
        rendered.catch(() => undefined)
        continue
      }
      if (isElement(rendered) && rendered.type === 'svg') {
        results.push({
          exportName: pair.exported === 'default' ? pair.local : pair.exported,
          svg: normalizeRootSvg(rendered),
        })
      }
    } catch {
      // 非纯图标导出通常依赖 React hooks 或业务上下文，直接跳过。
    }
  }

  return results
}

function safeExtractSvgExports(source, fileName) {
  try {
    return extractSvgExports(source, fileName)
  } catch {
    return []
  }
}

function isCandidateIconModule(source) {
  const imports = source.match(/import\s+[^;]+;\s*/gu) ?? []
  if (imports.length > 2) return false

  const withoutImports = source.replace(/import\s+[^;]+;\s*/gu, '')
  const firstSvgIndex = withoutImports.search(/[`"']svg[`"']/u)
  if (firstSvgIndex < 0) return false

  const beforeFirstSvg = withoutImports.slice(0, firstSvgIndex)
  if (beforeFirstSvg.length > 700) return false
  if (/function\s+[\w$]+\s*\(/u.test(beforeFirstSvg)) return false
  if (/\b(fetch|document|window|localStorage|sessionStorage)\b/u.test(beforeFirstSvg)) return false

  return true
}

function parseNamedExports(source) {
  const pairs = []
  const exportRegex = /export\s*\{([^}]+)\};?/gu
  let match
  while ((match = exportRegex.exec(source)) !== null) {
    const body = match[1]
    for (const part of body.split(',')) {
      const text = part.trim()
      if (!text) continue
      const aliasMatch = text.match(/^([\w$]+)\s+as\s+([\w$]+|default)$/u)
      if (aliasMatch) {
        pairs.push({ exported: aliasMatch[2], local: aliasMatch[1] })
      } else if (/^[\w$]+$/u.test(text)) {
        pairs.push({ exported: text, local: text })
      }
    }
  }
  return pairs
}

function transformModuleSource(source) {
  const importDecls = []
  const withoutImports = source.replace(/import\s+[^;]+;\s*/gu, (statement) => {
    importDecls.push(statement)
    return ''
  })

  const importStubs = importDecls.flatMap(renderImportStubs).join('\n')
  const withoutSourceMap = withoutImports.replace(/\/\/# sourceMappingURL=.*$/gmu, '')
  const withExports = withoutSourceMap.replace(/export\s*\{([^}]+)\};?/gu, (_, body) => {
    return body
      .split(',')
      .map((part) => {
        const text = part.trim()
        if (!text) return ''
        const aliasMatch = text.match(/^([\w$]+)\s+as\s+([\w$]+|default)$/u)
        if (aliasMatch) return `__exports[${JSON.stringify(aliasMatch[2])}] = ${aliasMatch[1]};`
        return `__exports[${JSON.stringify(text)}] = ${text};`
      })
      .filter(Boolean)
      .join('\n')
  })

  return `
const __exports = {};
${importStubs}
${withExports}
this.__exports = __exports;
`
}

function renderImportStubs(statement) {
  const sourceMatch = statement.match(/from\s+["']([^"']+)["']/u)
  const importPath = sourceMatch?.[1] ?? ''
  const specifierMatch = statement.match(/import\s+(.+?)\s+from\s+["'][^"']+["']/su)
  if (!specifierMatch) return []

  const specifier = specifierMatch[1].trim()
  const declarations = []
  if (specifier.startsWith('{')) {
    const body = specifier.replace(/^\{\s*/u, '').replace(/\s*\}$/u, '')
    for (const part of body.split(',')) {
      const item = part.trim()
      if (!item) continue
      const aliasMatch = item.match(/^([\w$]+)\s+as\s+([\w$]+)$/u)
      const imported = aliasMatch ? aliasMatch[1] : item
      const local = aliasMatch ? aliasMatch[2] : item
      declarations.push(`const ${local} = ${stubForImport(importPath, imported)};`)
    }
  } else if (specifier.startsWith('* as ')) {
    const local = specifier.replace(/^\*\s+as\s+/u, '').trim()
    declarations.push(`const ${local} = __genericStub;`)
  } else if (/^[\w$]+$/u.test(specifier)) {
    declarations.push(`const ${specifier} = __genericStub;`)
  }
  return declarations
}

function stubForImport(importPath, imported) {
  if (importPath.includes('jsx-runtime')) {
    if (imported === 't') return '__jsxRuntimeFactory'
    if (imported === 'n') return '__reactFactory'
  }
  if (basename(importPath).startsWith('chunk-Bj-mKKzh')) return '__interopNoop'
  if (basename(importPath).startsWith('clsx-')) return '__clsx'
  return '__genericStub'
}

function createSandbox() {
  const jsxRuntime = {
    Fragment: 'fragment',
    jsx: createElement,
    jsxs: createElement,
  }

  const genericStub = createGenericStub()

  return {
    Date,
    JSON,
    Math,
    Object,
    Symbol,
    __clsx: (...values) => values.filter(Boolean).join(' '),
    __exports: {},
    __genericStub: genericStub,
    __interopNoop: (value) => value,
    __jsxRuntimeFactory: () => jsxRuntime,
    __reactFactory: () => ({}),
    setTimeout: () => 0,
  }
}

function createElement(type, props = {}) {
  const attrs = {}
  let children = undefined
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'children') {
      children = value
    } else {
      attrs[key] = value
    }
  }
  return { attrs, children, type: String(type) }
}

function createGenericStub() {
  const fn = function genericStub() {
    return proxy
  }
  const proxy = new Proxy(fn, {
    apply: () => proxy,
    construct: () => proxy,
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive) return () => ''
      if (prop === 'then') return undefined
      return proxy
    },
  })
  return proxy
}

function isElement(value) {
  return Boolean(value && typeof value === 'object' && typeof value.type === 'string')
}

function normalizeRootSvg(svg) {
  return {
    ...svg,
    attrs: {
      ...svg.attrs,
      'aria-hidden': 'true',
      height: '1em',
      width: '1em',
    },
  }
}

function renderVueComponent(svg) {
  return `<template>\n${renderElement(svg, 1)}\n</template>\n`
}

function renderElement(element, depth) {
  if (!isElement(element)) return ''
  if (element.type === 'fragment') return renderChildren(element.children, depth)

  const indent = '  '.repeat(depth)
  const attrs = renderAttrs(element.attrs)
  const openTag = attrs ? `<${element.type} ${attrs}>` : `<${element.type}>`
  const children = renderChildren(element.children, depth + 1)

  if (!children) return `${indent}${openTag.replace(/>$/u, ' />')}`
  return `${indent}${openTag}\n${children}\n${indent}</${element.type}>`
}

function renderChildren(children, depth) {
  const normalized = Array.isArray(children) ? children : [children]
  return normalized
    .filter((child) => child !== null && child !== undefined && child !== false)
    .map((child) => {
      if (isElement(child)) return renderElement(child, depth)
      if (typeof child === 'string' || typeof child === 'number') {
        return `${'  '.repeat(depth)}${escapeText(String(child))}`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function renderAttrs(attrs) {
  const rendered = []
  for (const [key, rawValue] of Object.entries(attrs ?? {})) {
    if (key === 'children' || key === 'ref' || rawValue === undefined || rawValue === null || rawValue === false) continue
    if (typeof rawValue === 'function' || typeof rawValue === 'symbol') continue
    if (typeof rawValue === 'object') continue

    const attrName = key === 'className' ? 'class' : toSvgAttrName(key)
    const value = rawValue === true ? 'true' : String(rawValue)
    rendered.push(`${attrName}="${escapeAttr(value)}"`)
  }
  return rendered.join(' ')
}

function toSvgAttrName(name) {
  const specialCases = new Set(['viewBox', 'preserveAspectRatio'])
  if (specialCases.has(name)) return name
  return name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
}

function renderIndex(entries) {
  return `${entries
    .map((entry) => `export { default as ${entry.componentName} } from './${entry.componentName}.vue'`)
    .join('\n')}\n`
}

function renderManifest(entries) {
  const rows = entries.map((entry) => ({
    component: entry.componentName,
    exportName: entry.exportName,
    sourceFile: entry.sourceFile,
  }))

  return `export interface CodexIconManifestEntry {
  component: string
  exportName: string
  sourceFile: string
}

export const codexIconManifest = ${JSON.stringify(rows, null, 2)} satisfies CodexIconManifestEntry[]
`
}

function stripHash(name) {
  const parts = name.split('-').filter(Boolean)
  while (parts.length > 1) {
    const tail = parts.at(-1) ?? ''
    if (!/^[A-Za-z0-9_]+$/u.test(tail)) break
    if (!/[A-Z0-9_]/u.test(tail)) break
    parts.pop()
  }
  return parts.join('-').replace(/[._-]+$/u, '')
}

function toPascalCase(value) {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('')
}

function uniqueComponentName(name, usedNames) {
  let candidate = name
  let index = 2
  while (usedNames.has(candidate)) {
    candidate = `${name}${index}`
    index += 1
  }
  usedNames.add(candidate)
  return candidate
}

function escapeAttr(value) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

function escapeText(value) {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}
