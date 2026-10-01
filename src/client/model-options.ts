/** Derive slider stops from the exact model contract, preserving provider-owned effort IDs. */
export function sliderStops(reasoning: {
  efforts: readonly { id: string; name: string }[]; defaultEffort?: string
} | undefined, defaultLabel: string): readonly { id: string | undefined; name: string }[] {
  if (reasoning === undefined || reasoning.efforts.length === 0) return []
  return [
    ...reasoning.defaultEffort === undefined ? [{ id: undefined, name: defaultLabel }] : [],
    ...reasoning.efforts,
  ]
}
