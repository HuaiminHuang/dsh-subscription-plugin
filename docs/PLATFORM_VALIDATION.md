# Platform validation and maintenance

The plugin remains pinned to DSH `0.2.0-rc.2` and patched pi-ai `0.87.1`.
Cross-platform code and CI do not expand the shipped Desktop support claim.

## Automated checks

`.github/workflows/ci.yml` runs typecheck, tests, built-package checks,
`npm pack --dry-run`, and whitespace checks on Ubuntu, Windows and macOS.
It uses synthetic auth and makes no real account requests. Remote CI results
remain pending until the workflow runs on GitHub.

Path tests cover source/built layouts, Windows drives and UNC URLs, spaces,
Unicode directory names, CRLF Skill text and stable CSS identifiers.
The package verifier loads the actual built Skill and Client modules.
GitHub `prepare` installs still require the installing profile's pnpm build
permission; the package must not grant itself that permission.

## Desktop acceptance (pending)

Windows x64 and macOS Apple Silicon need a real Desktop window for each item:

- Install the built tarball, then separately install the GitHub source with prepare.
- Sign in through browser and device code; cancel and retry; restart and refresh.
- Generate, preview, download and reopen an existing image after restart.
- Switch model, reasoning and speed with keyboard and pointer input.
- Check narrow layout, light/dark contrast and native titlebar clearance.
- Disconnect/reconnect; disable and re-enable each Bundle row; unload the Bundle.

Record DSH revision, plugin commit, OS, architecture and observed outcomes.
Do not store credentials, authorization responses or unreviewed screenshots.
Other architectures require their own acceptance record.

## Architecture changes

`host/request-lifetime.ts` owns request leases, caller cancellation and waiting
for in-flight work. The Controller still owns login, catalog and routing policy.
`client/state-store.ts` owns Host revision ordering; `use-model-panel-position.ts`
owns panel geometry and observers without changing its rendering or interactions.
`lifecycle.ts` runs every disposer and reports accumulated failures afterward.
Host diagnostics report fixed failure stages, never underlying provider errors.

Further login/catalog extraction should be separate behavior-preserving changes
with the existing cancellation, sign-out and unload regressions retained.
