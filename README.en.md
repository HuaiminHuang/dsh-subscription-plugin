---
description: "Independent DSH Bundle for ChatGPT/Codex subscription login and model access."
kind: "package-bundle"
---

# @h2mzzz/dsh-openai-subscription

[简体中文](README.md) | English

An independent, opt-in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin. It adds an **OpenAI** page to the existing settings window and provides its own `codex-subscription` model route for Codex. This is not an official DeepSeek or OpenAI plugin.

> **Under development.** Type checks, mocked tests, built-package checks, and Host mount/unmount checks in an isolated Web profile have run on Ubuntu. Real ChatGPT authorization and model requests, full browser UI composition, and the Desktop client have not been validated. The package is `0.0.2` / `private`, distributed only as a GitHub Pre-release asset, not on npm.

## Compatibility

| Component | Current scope |
| --- | --- |
| DSH | `0.1.7-rc.2`, commit `477b4f420553e8a52c2fbccc464d7561b239c443` |
| pi-ai | DSH's patched `@earendil-works/pi-ai@0.85.1` |
| Web profile | Host mount/unmount in an isolated profile and built Client slot checks; real login and model calls remain unverified |
| Desktop | Reuses the Web UI but requires a separate installation in the Desktop profile; untested |

Other DSH versions and platforms are unverified. Do not bypass compatibility checks with a version exemption. See the [compatibility baseline](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/COMPATIBILITY_BASELINE.md) for exact dependencies and checkout requirements.

## Installation

Download the **built npm `.tgz` asset** from the [v0.0.2 Pre-release](https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/tag/v0.0.2). The Web profile can install directly from its URL:

```sh
dsh plugin --profile web add https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/download/v0.0.2/h2mzzz-dsh-openai-subscription-0.0.2.tgz
```

Alternatively, build the package from this repository. The build requires a checkout of the targeted DSH version at `../deepseek-harness`:

```sh
pnpm install --ignore-scripts
pnpm test:package
npm pack
```

`npm pack` creates `h2mzzz-dsh-openai-subscription-0.0.2.tgz`. Install it in the Web profile using its actual **absolute path**:

```sh
dsh plugin --profile web add /absolute/path/to/h2mzzz-dsh-openai-subscription-0.0.2.tgz
```

On a Desktop installation matching the compatibility baseline, enter the `.tgz` asset URL above or a local absolute path accessible on the Desktop machine under **Plugins → Add plugin**, then enable it as prompted. **Do not** run `dsh plugin --profile desktop` or edit the Desktop profile by hand. Web and Desktop share UI code, not plugin dependencies or activation state: installing on Web does not install on Desktop. Desktop installation and login are still untested. The Git repository and GitHub-generated source archives do not include the required `lib/` files and are not installable bundles.

Do not enable the former unscoped `dsh-openai-subscription` package and this package in the **same profile**: they share a route and historical credential key. During a maintenance window, remove the old package, install the new one, and restart when DSH prompts you. Disabling or removing the Bundle does not automatically sign out the plugin's account.

## Usage

1. Open the **OpenAI** page in DSH settings, select **Log in**, then choose browser login or device-code login. Browser login requires the browser and DSH Host to run on the same machine. Device-code acceptance by the service has not been tested with a real account. A callback page reporting completion does not prove that credentials were saved; check the plugin's actual state.
2. After a successful login, choose a model and reasoning effort under the `codex-subscription` route in DSH's model picker. The models come from the pinned pi-ai **static catalog**: listing a model ID does not prove the account can call it. The current catalog includes `gpt-5.6-terra` but not `gpt-6-sol` or `gpt-6-luna`.
3. To default **new sessions** in a particular Web profile to `gpt-5.6-terra` with Medium reasoning, configure the existing `agent-default-model` entry in that profile's `cordis.patch.yml`. This plugin does not override other profiles or existing session choices:

   ```yml
   - id: agent-default-model
     name: "@deepseek-ai/dsh-agent-default-model"
     config:
       provider: codex-subscription
       model: gpt-5.6-terra
       reasoningEffort: medium
   ```

For Codex models supporting Medium, the plugin's model metadata also defaults to Medium; an explicitly chosen supported effort takes precedence. Reasoning-effort mapping and forwarding have only been checked with mocks, not real requests. Desktop's Electron window blocks the blank tab opened before browser login; once an authorization link appears, you can try **Open login page** to hand it to the system browser. This Desktop flow has not been validated either.

## Bundle layout

| Files | Responsibility |
| --- | --- |
| `package.json`, `cordis.patch.yml` | Declare `dsh.bundle.patch`, the Web Client entry, and one optional Loader row |
| `src/index.ts`, `src/controller.ts` | Host plugin and the lifecycle of authorization, credential state, and model routing |
| `src/credential-store.ts`, `src/adapter.ts` | Plugin-owned OAuth record and conversion of Codex requests for DSH's `LlmAdapter` |
| `src/typert.host.ts`, `src/remote.ts` | Plugin-owned, validated Remote definitions between Host and Client |
| `src/client/` | `settings.section` page, Chinese and English locales, and styles; does not hold tokens |

The display name is OpenAI, but the provider ID remains `codex-subscription`, and the credential scope keeps the historical value `dsh-openai-subscription/codex`. Neither replaces DSH's official `openai` / `openai-codex` routes or reads another plugin's or the Codex CLI's credentials. Host handles OAuth callbacks, token refresh, and storage; Client receives only redacted display state and authorization-page links.

## Known limitations and deferred work

- Only text and ordinary tool calls are declared supported; images, deferred tools, and stop sequences are unsupported. Model calls, cancellation, and tool calls still lack real-account validation. Races between login-state refresh, sign-out, and unload have deterministic mocked tests but are not validated with a real account.
- Subscription quota, reset times, and reset cards are not implemented. Token usage for one request is **not** subscription quota and cannot be used to estimate remaining allowance.
- Desktop installation, window layout, and system-browser authorization have not been tested. Web mocks and build checks do not count as Desktop validation. Do not copy OAuth credential files between machines.
- Do not disclose tokens, authorization codes, full OAuth callback URLs, or real server responses in the repository, logs, chats, or screenshots.

## Development and releases

This repository provides `pnpm typecheck`, `pnpm test`, and `pnpm test:package` for type checking, mocked tests, and built Client activation checks. These **do not replace** real Loader/profile or account testing. See the [implementation plan](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/IMPLEMENTATION_PLAN.md) for architecture and acceptance stages, the [release guide](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/RELEASING.md) for maintainer packaging requirements, and [AGENTS.md](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/AGENTS.md) before making changes.
