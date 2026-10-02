---
description: "Use ChatGPT/Codex subscriptions in DSH with live models, reasoning controls, Fast mode, and image features."
kind: "package-bundle"
---

# OpenAI Subscription for DSH

[简体中文](README.md) | English

Use OpenAI models through your ChatGPT/Codex subscription in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). The plugin provides its own account sign-in, model selection, and image features without replacing DSH's existing OpenAI configuration.

## Subscription account

Sign in, check account status, or sign out from the **OpenAI** settings page. Host handles authorization, credential storage, and token refresh; the frontend receives only the state needed for display.

The plugin uses its own subscription authorization. No OpenAI API key is required, and it does not read credentials from other plugins or the Codex CLI.

## Live model catalog

After sign-in, the plugin fetches the account's visible model catalog. Settings and the conversation picker share the same list. Use **Refresh models** to fetch it again without signing out.

A successful discovery shows only visible, API-supported models returned by the server, without adding older static models. Failed or empty responses preserve the current catalog; a bundled catalog provides the initial fallback. The server determines actual access to each model.

## Model selection and reasoning effort

The compact panel combines model selection and reasoning controls in one popup:

- Select the model name to open the model list; choosing a model returns to the slider.
- Slider stops follow the selected model's supported efforts, including other providers' levels and defaults.
- Dragging moves continuously and snaps to a supported effort on release. Click and keyboard adjustments are also available.
- The closed composer control shows the model and effort; while the panel is open, it shows “Choose model.”

The reset button restores the selected model's default reasoning effort and Standard speed.

## Fast mode

Use the **lightning button** at the upper left of the panel to toggle Fast mode for OpenAI subscription models. It is off by default. When enabled, the icon is filled, and a lightning indicator also appears beside the model name in the composer.

Speed is independent of reasoning effort and creates no extra “Fast” model entries. With the compact panel disabled, the original model menu offers a separate speed switch.

Speed choices are scoped to each session and model, and return to Standard after Host restart or sign-out. Server eligibility determines Fast availability; Fast may consume more subscription allowance.

## Image input and vision

When the catalog declares image-input support, the plugin converts user images and tool-result images in the conversation into native model image messages. No separate vision tool is required.

Vision and image generation are independent: disabling the image tool does not disable image input. Image input remains experimental. Attachment conversion and protocol serialization are tested; real-account vision acceptance is still pending.

## Image generation tool

The separate **OpenAI Image Generation** component provides the `codex_generate_image` tool and a packaged Skill. They register automatically when the component is enabled and the account is signed in, without manual tool configuration.

Generated images appear in conversation cards with preview and download links. Direct tool calls are supported; nested calls through PTC `run_code` are not currently supported. Image generation remains experimental, with real-account end-to-end acceptance still pending.

## Independent component switches

Manage the following components separately from DSH's **Plugins** page:

| Component | Features |
| --- | --- |
| OpenAI subscription access | Account authorization, live catalog, and model requests |
| OpenAI Image Generation | Image tool, Skill, and image cards |
| Compact model slider | Model selection, reasoning slider, and lightning switch |

Disabling image generation preserves subscription conversations. Disabling the compact slider restores the original model/reasoning menu and keeps existing effort and speed choices. Disabling subscription access also stops features that depend on its account authorization.

## Installation and first use

Install a built npm `.tgz` package into the Web profile, replacing the example with the actual absolute path:

```sh
dsh plugin --profile web add /absolute/path/to/plugin.tgz
```

Load the plugin as prompted by DSH, sign in under **Settings → OpenAI**, and select a subscription model in the conversation picker. GitHub-generated source archives are not directly installable plugin packages.

See the [release guide](docs/RELEASING.md) for build and installation instructions, [release notes](docs/RELEASE_NOTES_v0.1.1.md) for verification scope, and [compatibility baseline](docs/COMPATIBILITY_BASELINE.md) for technical requirements. Subscription quota lookup and reset cards are not implemented.

This is an independent community plugin, not an official DeepSeek or OpenAI product.

The current version `0.1.1` targets DSH `0.2.0-rc.2` and its patched pi-ai `0.87.1`. The release scope is limited to Ubuntu / Web; Desktop and real-account end-to-end flows remain unverified. Older plugin releases pin DSH `0.1.7-rc.2` and fail the new runtime version preflight.

Git source installation is supported by the current source change (the old `v0.1.1` tag does not include it):

```sh
dsh plugin --profile web add github:HuaiminHuang/dsh-subscription-plugin#codex/github-prepare
```

The self-contained `prepare` builds Host, Client, Typert and declarations without a DSH source checkout. If pnpm requires build approval, copy the exact key printed in its error (including the Git source and commit) into the target profile's `pnpm-workspace.yaml` and retry. If pnpm switches to a GitHub download source and reports another key, retain the existing entry and add that key too. A package-name-only key is insufficient for Git prepare in pnpm 11.7:

```yaml
allowBuilds:
  "<exact key printed by pnpm>": true
  "@google/genai": false
  protobufjs: false
```

The pi-ai dependencies `@google/genai` and `protobufjs` do not need installation scripts for this Codex plugin; deny them explicitly as this repository already does.

This permits the plugin's build code to execute during installation. Pin a verified commit by appending `#<commit>` to the Git spec. The package remains private and is not published to the npm registry.
