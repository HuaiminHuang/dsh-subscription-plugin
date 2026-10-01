/** Opt-in DSH tool; never changes the text LlmAdapter or its image modalities. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ImageBackend } from './backend.ts'
import { generateImage, ImageGenerationError } from './backend.ts'
import { IMAGE_SUCCESS_TEXT } from './contract.ts'

export interface ImageToolDependencies extends ImageBackend {
  withImageAuth<T>(signal: AbortSignal, run: (access: string, signal: AbortSignal) => Promise<T>): Promise<T>
}

/** Single-grant cooperative concurrency gate across Agents, not just one tool batch. */
export class ImageGate {
  private tail: Promise<void> = Promise.resolve()

  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    const prior = this.tail
    let release!: () => void
    this.tail = new Promise<void>(resolve => { release = resolve })
    let abort = (): void => {}
    let acquired = false
    try {
      // Abort waiting promptly; the queued reservation is still released in finally.
      await Promise.race([prior, new Promise<never>((_, reject) => {
        if (signal.aborted) reject(signal.reason)
        else {
          abort = () => reject(signal.reason)
          signal.addEventListener('abort', abort, { once: true })
        }
      })])
      // If cancellation wins the race, later reservations must still wait for prior.
      await prior
      acquired = true
      signal.throwIfAborted()
      return await task()
    } finally {
      signal.removeEventListener('abort', abort)
      if (acquired) release()
      else void prior.then(release)
    }
  }
}

/** Construct an Agent-only tool whose persisted output is text plus replayable UI metadata. */
export function createImageTool(deps: ImageToolDependencies, gate = new ImageGate()) {
  return defineTool({
    name: 'codex_generate_image',
    description: 'Generate one image on an explicit user request using this Host\'s opt-in Codex subscription grant. No editing or reference images.',
    parameters: { prompt: { type: 'string', required: true, description: 'Detailed visual description for one image; 1–4000 characters.' } },
    timeoutMs: 180_000,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          image: { type: 'object', required: true, additionalProperties: true, properties: {
            attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', required: true },
            bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
          } },
        },
      },
      render: () => [{ type: 'text', text: IMAGE_SUCCESS_TEXT }],
      presentationMeta: (_args, value) => ({ image: value.image, sessionId: value.sessionId }),
    },
    async execute(args, exec) {
      if (exec.agent?.session === undefined || exec.parent !== undefined) {
        throw new Error('Image generation requires a direct agent session')
      }
      if (!args.prompt.trim() || args.prompt.length > 4000) throw new Error('Image prompt must contain 1–4000 characters')
      let ref
      try {
        ref = await gate.run(exec.signal, () => deps.withImageAuth(exec.signal, (access, signal) =>
          generateImage(deps, access, args.prompt, signal)))
      } catch (error) {
        if (exec.signal.aborted) throw new Error('Image generation cancelled')
        if (error instanceof ImageGenerationError) throw new Error(error.message)
        throw new Error('Image generation unavailable')
      }
      return { image: { ...ref }, sessionId: String(exec.agent.session.id) }
    },
  })
}
