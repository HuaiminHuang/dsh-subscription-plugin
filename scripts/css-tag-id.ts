/** Stable style ownership IDs for both Windows and POSIX build paths. */
import { posix } from 'node:path'

export function cssTagId(packageId: string, file: string): string {
  return `${packageId}/${posix.basename(file.replaceAll('\\', '/'))}`
}
