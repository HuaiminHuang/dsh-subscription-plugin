---
name: codex-subscription-imagegen
description: Generate or transform one image with up to ten session-owned references through the optional Codex subscription Host tool.
---

# Codex subscription image generation

Use `codex_generate_image` only when the user explicitly requests image generation or changes to an existing image. Give it a detailed visual prompt for **one** image. It uses the current Host profile's opt-in subscription grant; do not ask for credentials or use a fallback application or script.

This version requires a native, direct tool call. Do not dispatch it from `run_code` / PTC: nested results cannot yet display a durable image card.

For text-only generation, omit `reference_images`. For reference-based generation or changes to an existing image, pass an ordered `reference_images` array with **at most 10 entries**. Each entry must contain exactly one of:

- `attachment_id`: the exact `sha256:…` ID from a user/tool image handle in this session.
- `tool_call_id`: the exact recorded ID of an earlier successful `codex_generate_image` call in this session.

Use the actual handles/call IDs; do not invent identifiers or supply filesystem paths, URLs or Base64. If the required image is not available in this session, ask the user to upload it here. More than ten references fail before any request; ask the user to select ten or fewer, never silently drop the rest. References are limited to 20 MB each and 50 MB combined.

State each image's role and requested changes in `prompt`, in the same order as the references, for example “Image 1 is the subject; use Image 2 for the background style; preserve the subject's shape and colors.” Describe what must remain unchanged when modifying a source image. This is generative transformation, not guaranteed pixel-preserving editing; masks and batch output are unsupported.

Its text result confirms only that the Host saved an image; the user receives the image in the matching tool card. If the tool fails or the card cannot display the image, say so plainly rather than claiming delivery. Do not infer remaining quota or account entitlement from login status.
