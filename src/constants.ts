import { credentialKey } from '@deepseek-ai/dsh-credentials'

/** The public DSH provider route owned solely by this plugin. */
export const PROVIDER_ID = 'codex-subscription'

/** The pi-ai provider id used internally by this plugin. */
export const PI_PROVIDER_ID = 'openai-codex'

/** The plugin-owned grant record; never shared with another adapter. */
export const CODEX_CREDENTIAL_KEY = credentialKey('dsh-openai-subscription', 'codex')
