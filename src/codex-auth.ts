/** Shared Codex subscription identity extracted from the plugin's own OAuth access token. */

const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]*$/
const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const MAX_ACCESS_LENGTH = 32_000

/**
 * Read the ChatGPT account routing claim from one access token.
 * The caller supplies the token it already owns; a Client-provided ID is never accepted.
 * @param access - the plugin's current OAuth access token.
 * @returns the account ID the token is issued for.
 * @throws when the token is malformed or carries no usable account claim.
 */
export function accountIdFromAccess(access: string): string {
  try {
    if (access.length > MAX_ACCESS_LENGTH || !JWT_PATTERN.test(access)) throw new Error()
    const payload: unknown = JSON.parse(Buffer.from(access.split('.')[1]!, 'base64url').toString('utf8'))
    const auth = (payload as Record<string, unknown>)['https://api.openai.com/auth']
    if (typeof auth !== 'object' || auth === null) throw new Error()
    const id = (auth as Record<string, unknown>).chatgpt_account_id
    if (typeof id !== 'string' || !ACCOUNT_ID_PATTERN.test(id)) throw new Error()
    return id
  } catch {
    throw new Error('Codex subscription access token has no usable account claim')
  }
}
