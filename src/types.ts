/** Client-safe view of the Codex subscription login lifecycle. */
export type CodexLoginStatus = 'checking' | 'signed-out' | 'signing-in' | 'signed-in' | 'error'

/** One prompt that the Host is waiting for the current settings page to answer. */
export interface CodexLoginPrompt {
  readonly kind: 'select'
  readonly message: string
  readonly options: readonly { readonly id: string; readonly label: string; readonly description?: string }[]
}

/** Safe, token-free state displayed by the settings page. */
export interface CodexSubscriptionState {
  readonly status: CodexLoginStatus
  readonly attemptId?: string
  readonly notice?: { readonly message: string; readonly url?: string; readonly code?: string }
  readonly prompt?: CodexLoginPrompt
  readonly models: readonly { readonly id: string; readonly name: string }[]
  /** Stable, non-provider error category; presentation stays in Client locales. */
  readonly error?: 'login-failed' | 'saved-login-unavailable'
  readonly checkedAt?: string
}
