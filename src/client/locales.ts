/** English strings for the Codex subscription settings page. */
export const en = {
  nav: 'OpenAI',
  title: 'OpenAI',
  intro: 'Sign in with the ChatGPT account that includes your Codex subscription. Tokens stay on this device and are never sent to the browser.',
  signedOut: 'Not signed in',
  signingIn: 'Signing in…',
  signedIn: 'Signed in',
  checking: 'Checking saved sign-in…',
  error: 'Sign-in needs attention',
  loginFailed: 'Sign-in did not finish. A successful callback page does not confirm that tokens were saved. Try again or use device code sign-in.',
  loginTimeout: 'Sign-in timed out. Check that this browser can reach the DSH computer, or try device code sign-in.',
  savedLoginUnavailable: 'The saved sign-in is not currently usable. Sign in again to repair it.',
  operationFailed: 'Could not complete this action. Check the connection and try again.',
  browserSignIn: 'Sign in in browser',
  browserDescription: 'Use a browser on the same computer as DSH.',
  deviceSignIn: 'Sign in with device code',
  deviceDescription: 'Open the verification page and enter the code shown here.',
  browserNotice: 'Open the sign-in page to continue. The browser must run on the same computer as DSH.',
  deviceNotice: 'Open the verification page and enter this code.',
  progressNotice: 'Preparing sign-in…',
  cancel: 'Cancel sign-in',
  signOut: 'Sign out',
  showMethods: 'Sign in',
  hideMethods: 'Hide options',
  models: 'Available models',
  refreshModels: 'Refresh models',
  refreshModelsFailed: 'Could not refresh models. The current list is kept; try again.',
  noModels: 'No models are available until sign-in succeeds.',
  openLink: 'Open sign-in page',
  copyLink: 'Copy link',
  copied: 'Copied',
}

/** Chinese strings for the Codex subscription settings page. */
export const zh: { [Key in keyof typeof en]: string } = {
  nav: 'OpenAI',
  title: 'OpenAI',
  intro: '使用包含 Codex 订阅的 ChatGPT 账号登录。令牌只保存在本机 Host，不会发送到浏览器。',
  signedOut: '尚未登录',
  signingIn: '正在登录…',
  signedIn: '已登录',
  checking: '正在检查已保存的登录…',
  error: '登录需要处理',
  loginFailed: '登录未完成。回调页面显示完成不代表令牌已保存，请重试或改用设备代码登录。',
  loginTimeout: '登录超时。请确认浏览器与 DSH 在同一台电脑上，或尝试设备代码登录。',
  savedLoginUnavailable: '已保存的登录当前不可用，请重新登录。',
  operationFailed: '操作未完成，请检查连接后重试',
  browserSignIn: '浏览器登录',
  browserDescription: '适用于与 DSH 在同一台电脑上的浏览器',
  deviceSignIn: '设备代码登录',
  deviceDescription: '打开验证页面，输入这里显示的代码',
  browserNotice: '打开登录页面继续，浏览器需与 DSH 在同一台电脑上',
  deviceNotice: '打开验证页面并输入此代码',
  progressNotice: '正在准备登录…',
  cancel: '取消登录',
  signOut: '退出登录',
  showMethods: '登录',
  hideMethods: '收起方式',
  models: '可用模型',
  refreshModels: '刷新模型',
  refreshModelsFailed: '模型刷新失败，已保留当前列表，请重试',
  noModels: '登录成功后才会显示可用模型',
  openLink: '打开登录页面',
  copyLink: '复制链接',
  copied: '已复制',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the independent Codex subscription settings page. */
    'settings.codexSubscription': keyof typeof en
  }
}
