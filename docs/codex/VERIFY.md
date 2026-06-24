# Codex Verification Checklist

<!-- CODEX_GENERATED_V1 -->

Project: AIWatch  
Project type: Next.js / Bun / worker / production deployment

## Default Rule

Before saying a task is done, run the smallest verification that proves the changed behavior. If no reliable automated command is available, state the manual check you performed and what remains unverified.

## Project Checks

- Run unit tests: bun test src.
- Run integration tests when DB-related behavior changes: bun test tests/integration.
- Run typecheck: bun run typecheck.
- Run build before deploy: bun run build.
- For production changes, verify container tag, HTTP 200, and real browser render.

## Common Completion Checklist

- Confirm the change matches the user's latest request.
- Confirm unrelated files were not reformatted or refactored.
- Check for secrets before sharing logs or diffs.
- Summarize what was verified and what was not.

