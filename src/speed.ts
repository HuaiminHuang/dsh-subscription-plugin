/** Models documented to accept Fast; account access is still determined by the server. */
const FAST_MODELS = new Set([
  'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5',
])
export const supportsFast = (model: string): boolean => FAST_MODELS.has(model)
/** Apply the tier through pi-ai's preserved payload hook, independently of reasoning. */
export const speedPayload = (enabled: boolean) => (payload: unknown): unknown => ({
  ...payload as Record<string, unknown>, service_tier: enabled ? 'fast' : 'default',
})
