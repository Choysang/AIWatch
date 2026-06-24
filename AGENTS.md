# AGENTS.md

<!-- CODEX_EFFICIENCY_BLOCK_V1 -->

## Codex Efficiency Block

Project type: Next.js / Bun / worker / production deployment

Before changing this project:

- State assumptions and success criteria before implementation.
- Keep changes surgical; do not refactor adjacent code unless it is required for the task.
- For broad requests, split work into a main planning thread and narrow sub-agent tasks.
- Separate research from execution: gather facts first, then decide what to change.
- Use the project verification checklist in $verifyPath.
- Use the project workflow guide in $workflowPath.
- Do not claim success until the relevant verification commands or manual checks have been run.

Project-specific notes:

- Do not print secrets from .env or production .env files.
- Deployment uses GHCR images and server pull/restart flow; consult docs/deploy-ghcr.md and docs/deployment.md.
- Separate research/source curation from production code changes.

