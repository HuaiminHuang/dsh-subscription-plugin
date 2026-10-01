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
2. After a successful login, choose a model and reasoning effort under the `codex-subscription` route in DSH's model picker. The plugin queries the account's currently visible catalog through its own OAuth grant at the Codex backend `GET /backend-api/codex/models`, then keeps only rows with `visibility: "list"` and `supported_in_api`, which filters internal entries such as `gpt-reserve` and `codex-auto-review`; the reasoning levels it offers are narrowed to each model's server-reported `supported_reasoning_levels`. That endpoint gates answers by its `client_version` parameter: the generation matching the installed pi-ai answers with an empty list, so the plugin sends a pinned generation known to return the full catalog. A failed or empty discovery keeps the catalog already in use (the bundled static catalog at first login) instead of emptying the model list, and is retried on the next login-state check; one discovery request is capped at 15 seconds and is cancelled with sign-out or plugin unload, so a hanging endpoint cannot hold the login check or teardown open. Listing a model ID still does not prove the account can call it.
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
| `package.json`, `cordis.patch.yml` | Declare `dsh.bundle.patch`, the Web Client entry, and separate subscription, image-tool, and compact-model-control Loader rows |
| `src/index.ts`, `src/controller.ts` | Host plugin and the lifecycle of authorization, credential state, and model routing |
| `src/credential-store.ts`, `src/adapter.ts` | Plugin-owned OAuth record and conversion of Codex requests for DSH's `LlmAdapter` |
| `src/discovery.ts`, `src/codex-auth.ts` | Live account catalog discovery over the plugin's own grant, and the account claim both the catalog and image requests read from it |
| `src/typert.host.ts`, `src/remote.ts` | Plugin-owned, validated Remote definitions between Host and Client |
| `src/client/` | `settings.section` page, Chinese and English locales, and styles; does not hold tokens |
| `src/imagegen/`, `src/client/imagegen/`, `skills/codex-subscription-imagegen/` | Experimental optional Host image tool, session card, and packaged Skill; separate from the text adapter |

The display name is OpenAI, but the provider ID remains `codex-subscription`, and the credential scope keeps the historical value `dsh-openai-subscription/codex`. Neither replaces DSH's official `openai` / `openai-codex` routes or reads another plugin's or the Codex CLI's credentials. Host handles OAuth callbacks, token refresh, and storage; Client receives only redacted display state and authorization-page links.

## Known limitations and deferred work

- The model route accepts text, ordinary tool calls, and user/tool-result images when the model catalog declares `image`. Host reads DSH attachments and converts them to native Codex image messages independently of the image-generation row. Preview budgets match DSH pi-ai: 2048×2048 pixels, a 1 MiB encoded target per image, and a 20 MiB Base64 request bound. Offloaded history remains text; oversized requests return the standard offload requirement. Attachment conversion and the actual pi-ai serializer are tested; real-account vision remains unverified. Deferred tools, system/assistant/developer images, and stop sequences are unsupported. The new experimental `codex_generate_image` is a separate Host tool, enabled with the Bundle by default. Use the independent **OpenAI Image Generation** row switch in the sidebar **Plugins** page; no `imageGen.enabled` setting is required. Its packaged Skill and tool register only when that row is enabled and signed in; disabling it preserves text login and model routing. Model-facing results are text; the plugin card reads images through an authenticated session-bound endpoint. This version accepts **native direct tool calls only**: nested PTC `run_code` dispatches are rejected rather than silently losing the image card. Loader/profile, browser UI and real-account end-to-end acceptance are **not yet complete**, and the v0.0.2 release artifact does not include this feature. Switching and registration have mocked and built-package evidence; real-account image generation still needs separate acceptance.
- Model calls, cancellation, and tool calls still lack real-account validation. Races between login-state refresh, sign-out, and unload have deterministic mocked tests but are not validated with a real account.
- Subscription quota, reset times, and reset cards are not implemented. Token usage for one request is **not** subscription quota and cannot be used to estimate remaining allowance.
- Desktop installation, window layout, and system-browser authorization have not been tested. Web mocks and build checks do not count as Desktop validation. Do not copy OAuth credential files between machines.
- Do not disclose tokens, authorization codes, full OAuth callback URLs, or real server responses in the repository, logs, chats, or screenshots.

## Development and releases

This repository provides `pnpm typecheck`, `pnpm test`, and `pnpm test:package` for type checking, mocked tests, and built Client activation checks. These **do not replace** real Loader/profile or account testing. See the [implementation plan](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/IMPLEMENTATION_PLAN.md) for architecture and acceptance stages. The [Codex CLI image-generation investigation](docs/CODEX_IMAGEGEN_INVESTIGATION.md) and [separate image-generation tool and Skill plan](docs/IMAGE_GENERATION_TOOL_PLAN.md) record evidence, implementation boundaries, and **outstanding acceptance checks**; they are not a shipped feature claim. See the [release guide](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/RELEASING.md) for packaging requirements, and [AGENTS.md](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/AGENTS.md) before changes.

Settings and the conversation selector use the same discovered catalog. While signed in, use “Refresh models” to fetch it again; a failed refresh keeps the current list and does not require signing out.

## Model control and Fast mode

The composer control uses DSH's shared catalog and selection operations for every provider. Thinking slider stops come from each exact model, including provider defaults and custom efforts. The lightning control requests Fast independently for documented OpenAI subscription models; reset restores the exact model's default effort and Standard speed. It creates no model variants. Account eligibility is decided by the server, and Fast consumes more subscription allowance. Speed selections are isolated by session/model for the current Host lifetime, and reset on Host restart or sign-out. Auxiliary title/compaction calls remain Standard. Unloading the plugin restores the original DSH model control.

Successful discovery uses only the filtered live models; failed or empty discovery retains the current catalog. Built-package simulated-browser behavior is covered, but actual Fast service-tier processing with a real account has not been verified.

The Plugins panel has a separate **Compact model slider** component. Disabling it restores the model/reasoning menu layout, with a default-off speed switch for OpenAI subscription models. Existing speed and reasoning choices survive this presentation toggle. The compact panel switches to its model list in the same popup and returns after selection. The slider moves continuously during pointer drag, snapping to a supported effort only on release; keyboard navigation remains one effort per step. Reasoning stops appear as dots without a label footer.

The composer button shows the selected model and reasoning effort while closed, with a lightning indicator when Fast is selected, and “Choose model” while the popup is open. Saving a reasoning choice keeps the same slider node and focus, without dimming the compact controls.
