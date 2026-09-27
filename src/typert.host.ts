/**
 * Loader-visible Host reflection for this external package.
 *
 * DSH's workspace generator deliberately only scans projects rooted below its
 * own `packages/` directory; this package therefore ships the equivalent,
 * explicit manifest for its small Remote surface.
 */
import { TYPERT_REMOTE } from './remote.ts'

export const TYPERT = {
  package: '@h2mzzz/dsh-openai-subscription',
  face: 'host',
  schemas: [],
  invocations: TYPERT_REMOTE.descriptors,
  model: { services: [], events: [], objects: [] },
}
