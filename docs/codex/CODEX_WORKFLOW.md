# Codex Workflow Guide

<!-- CODEX_GENERATED_V1 -->

Project: AIWatch  
Project type: Next.js / Bun / worker / production deployment

## How To Start A Task

1. Restate the request in one sentence.
2. List assumptions and any ambiguity.
3. Define success criteria.
4. Inspect the smallest relevant files or docs.
5. Make a short plan for multi-step work.

## When To Use Sub-Agents

Use sub-agents when the work naturally splits into independent areas, for example:

- one agent reads architecture or prior decisions;
- one agent investigates tests/build/deployment;
- one agent examines a specific subsystem;
- the main thread integrates findings and makes the final decision.

Do not send multiple agents to edit the same files. For code changes, assign clear ownership.

## Research vs Execution

For research tasks, first collect facts and cite sources or project files. For execution tasks, convert the facts into a small, verifiable change. Avoid mixing a large research sweep with production edits in the same step.

## Useful Prompt Template

    Read this project using AGENTS.md and docs/codex/VERIFY.md.
    Before editing, state assumptions, success criteria, and the smallest safe plan.
    If the task is broad, propose sub-agent slices.
    After editing, run the relevant verification and summarize evidence.

## Project Notes

- Do not print secrets from .env or production .env files.
- Deployment uses GHCR images and server pull/restart flow; consult docs/deploy-ghcr.md and docs/deployment.md.
- Separate research/source curation from production code changes.

