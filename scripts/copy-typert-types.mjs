import { cp, mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await Promise.all([
  cp('lib/types/typert.host.d.ts', 'lib/typert.host.d.ts'),
  cp('lib/types/remote.d.ts', 'lib/typert.remote-client.d.ts'),
])
