/** English strings for the Codex subscription settings page. */
export const en = {
  nav: 'OpenAI / Codex',
  title: 'OpenAI / Codex subscription',
  intro: 'Sign in with the ChatGPT account that includes your Codex subscription. Tokens stay on this device and are never sent to the browser.',
  signedOut: 'Not signed in',
  signingIn: 'Signing in…',
  signedIn: 'Signed in',
  checking: 'Checking saved sign-in…',
  error: 'Sign-in needs attention',
  loginFailed: 'The sign-in did not complete. Try again.',
  savedLoginUnavailable: 'The saved sign-in is not currently usable. Sign in again to repair it.',
  signIn: 'Sign in with ChatGPT',
  cancel: 'Cancel sign-in',
  signOut: 'Sign out',
  refresh: 'Check sign-in',
  models: 'Available models',
  noModels: 'No models are available until sign-in succeeds.',
  promptAnswer: 'Continue',
  promptPlaceholder: 'Enter your response',
  openLink: 'Open sign-in page',
  copyLink: 'Copy link',
  copied: 'Copied',
  selectMethod: 'Choose a sign-in method',
  safeNotice: 'Never paste a password, access token, refresh token, or full callback URL here.',
}

/** Chinese strings for the Codex subscription settings page. */
export const zh: { [Key in keyof typeof en]: string } = {
  nav: 'OpenAI / Codex',
  title: 'OpenAI / Codex 订阅',
  intro: '使用包含 Codex 订阅的 ChatGPT 账号登录。令牌只保存在本机 Host，不会发送到浏览器。',
  signedOut: '尚未登录',
  signingIn: '正在登录…',
  signedIn: '已登录',
  checking: '正在检查已保存的登录…',
  error: '登录需要处理',
  loginFailed: '登录未完成，请重试。',
  savedLoginUnavailable: '已保存的登录当前不可用，请重新登录。',
  signIn: '使用 ChatGPT 登录',
  cancel: '取消登录',
  signOut: '退出登录',
  refresh: '检查登录',
  models: '可用模型',
  noModels: '登录成功后才会显示可用模型',
  promptAnswer: '继续',
  promptPlaceholder: '输入回答',
  openLink: '打开登录页面',
  copyLink: '复制链接',
  copied: '已复制',
  selectMethod: '选择登录方式',
  safeNotice: '请勿在此粘贴密码、access token、refresh token 或完整回调 URL',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the independent Codex subscription settings page. */
    'settings.codexSubscription': keyof typeof en
  }
}
