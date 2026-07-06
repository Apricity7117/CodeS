import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'dist-cli',
  tsconfig: 'tsconfig.server.json',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['express', 'commander'],
})
