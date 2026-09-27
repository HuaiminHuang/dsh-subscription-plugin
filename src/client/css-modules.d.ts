declare module '*.module.css' {
  /** Install this package's stylesheet for one Client lifecycle. */
  export function install(): () => void
  const classes: Readonly<Record<string, string>>
  export default classes
}
