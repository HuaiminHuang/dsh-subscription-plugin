# Development skills

These selected skills and their supporting scripts were copied from `deepseek-ai/deepseek-harness` at [`477b4f420553e8a52c2fbccc464d7561b239c443`](https://github.com/deepseek-ai/deepseek-harness/tree/477b4f420553e8a52c2fbccc464d7561b239c443/.agents/skills). Their instructions were adjusted for this independent repository; their Python scripts remain unchanged. Upstream-relative documentation links now point to that source tree. This repository does not contain the DSH monorepo's gates, Agent Notes, profiles, or app build. Use the instructions in the root [AGENTS.md](../AGENTS.md) and this repository's actual scripts when they differ.

| Skill | When to use |
| --- | --- |
| [dsh-client-ui-ux](skills/dsh-client-ui-ux/SKILL.md) | Codex settings page, login prompts, quota errors, themes, and Desktop layout. |
| [dsh-ci-test-reliability](skills/dsh-ci-test-reliability/SKILL.md) | OAuth callback servers, concurrent refresh, cancellation, and teardown tests. |
| [record-browser-gif](skills/record-browser-gif/SKILL.md) | Demonstrating a real settings/authorization flow; includes its encoder and unit tests. |

This is a **selected copy**, not a mirror of `.agents/`: internal PR-stack, vendoring, repository-wide doc/gate, and archived-note workflows were not copied. Do not run instructions tied to `packages/*`, `apps/web`, DSH root `.env`, or DSH CI in this standalone repository without verifying a matching checkout and scope.
