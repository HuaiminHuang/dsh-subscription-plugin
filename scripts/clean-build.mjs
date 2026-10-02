import { rm } from 'node:fs/promises'

// Each build owns lib/, including incremental TypeScript state and shared chunks.
await rm(new URL('../lib', import.meta.url), { recursive: true, force: true })
