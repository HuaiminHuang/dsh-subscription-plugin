export const en = {
  title: 'Generated image', loading: 'Loading image…', retry: 'Retry',
  unavailable: 'The image could not be loaded. Check the connection and try again.',
  pending: 'Generating image…', failed: 'Image generation did not finish.', download: 'Download image',
  alt: 'Generated image',
}
export const zh: { [Key in keyof typeof en]: string } = {
  title: '生成的图片', loading: '正在加载图片…', retry: '重试',
  unavailable: '无法加载图片，请检查连接后重试',
  pending: '正在生成图片…', failed: '生图未完成', download: '下载图片',
  alt: '生成的图片',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'tool.codexImage': keyof typeof en }
}
