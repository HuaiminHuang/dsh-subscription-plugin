/** Typed copy for the plugin-owned composer model control. */
export const modelEn = {
  off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max',
  model: 'Model', speed: 'Speed', effortMenu: 'Reasoning level', back: 'Back',
  choose: 'Choose model', panel: 'Model and thinking', thinking: 'Thinking effort',
  standard: 'Standard', fast: 'Fast', fastHint: 'Request Fast mode. Uses more subscription allowance; access depends on your account and model.',
  unsupported: 'Fast mode is unavailable for this model', reset: 'Reset thinking and speed',
  default: 'Provider default', none: 'This model has no thinking settings', failed: 'Could not apply the selection. Try again.',
  retry: 'Reload models', close: 'Close', loading: 'Loading models',
}
export const modelZh: { [K in keyof typeof modelEn]: string } = {
  off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高',
  model: '模型', speed: '速度', effortMenu: '推理等级', back: '返回',
  choose: '选择模型', panel: '模型与思考强度', thinking: '思考强度',
  standard: '标准', fast: '快速', fastHint: '请求快速模式，会消耗更多订阅额度；是否可用取决于账号和模型',
  unsupported: '此模型暂不支持快速模式', reset: '恢复默认思考强度和速度',
  default: '提供商默认', none: '此模型没有思考强度选项', failed: '选择未生效，请重试',
  retry: '重新加载模型', close: '关闭', loading: '正在加载模型',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'codex.model': keyof typeof modelEn }
}
