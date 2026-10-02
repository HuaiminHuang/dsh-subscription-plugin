/** Client-safe view of the Codex subscription login lifecycle. */
export type CodexLoginStatus = 'checking' | 'signed-out' | 'signing-in' | 'signed-in' | 'error'

/** The two Codex OAuth methods verified in the targeted pi-ai release. */
export type CodexLoginMethod = 'browser' | 'device_code'

/** Safe, token-free state displayed by the settings page. */
export interface CodexSubscriptionState {
  readonly status: CodexLoginStatus
  /** Non-secret Host lifetime marker for comparing revisions after a reconnect. */
  readonly instanceId?: string
  /** Monotonic within one Host lifetime; a delayed snapshot must not erase a newer notice. */
  readonly revision?: number
  readonly attemptId?: string
  readonly method?: CodexLoginMethod
  readonly notice?: { readonly kind: 'browser' | 'device_code' | 'progress'; readonly url?: string; readonly code?: string }
  readonly models: readonly { readonly id: string; readonly name: string }[]
  /** Stable, non-provider error category; presentation stays in Client locales. */
  readonly error?: 'login-failed' | 'login-timeout' | 'saved-login-unavailable'
  /** Whether the independently switchable compact model UI row is mounted. */
  readonly compactModelControl?: boolean
  readonly checkedAt?: string
}

/** Host-owned, per-session and per-model speed choice; reset when the Host unloads. */
export interface CodexSpeedState {
  readonly enabled: boolean
  /** Model can request Fast; this does not assert account entitlement. */
  readonly supported: boolean
}

/** Safe server-reported account quota window, independent of per-request token usage. */
export interface CodexUsageWindow {
  readonly windowDurationMins: number
  readonly usedPercent: number
  readonly resetsAt: number | null
}

export interface CodexUsageSnapshot {
  readonly windows: readonly CodexUsageWindow[]
  readonly checkedAt: string
}
