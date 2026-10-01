---
name: codex-subscription-imagegen
description: Generate one image through the optional Codex subscription Host tool.
---

# Codex subscription image generation

Use `codex_generate_image` only when the user explicitly requests a new image. Give it a detailed visual prompt for **one** image. It uses the current Host profile's opt-in subscription grant; do not ask for credentials or use a fallback application or script.

This version requires a native, direct tool call. Do not dispatch it from `run_code` / PTC: nested results cannot yet display a durable image card.

This tool does not edit images, accept reference images, or support a batch. Its text result confirms only that the Host saved an image; the user receives the image in the matching tool card. If the tool fails or the card cannot display the image, say so plainly rather than claiming delivery. Do not infer remaining quota or account entitlement from login status.
