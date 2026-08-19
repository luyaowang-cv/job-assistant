---
name: ssd-feature-delivery
description: Drive a Job Assistant feature from a testable specification through contracts, plan, tasks, implementation, and verification. Use whenever proposing, changing, or implementing a product feature, API, database schema, LangGraph workflow, or Chrome extension capability in this repository.
---

# SSD Feature Delivery

Follow this lifecycle for every feature:

1. Create or update `specs/features/F-XXX-<slug>.md`.
2. Update every affected contract in `specs/contracts/` before code.
3. Create `plans/F-XXX-<slug>.plan.md` with architecture, risks, and verification.
4. Create `tasks/F-XXX-<slug>.tasks.md` as small ordered tasks with acceptance checks.
5. Implement only approved tasks and keep changes within the feature scope.
6. Run verification, record results, and update the spec if implementation changes it.

## Required quality gates

- Clarify decisions that change scope, data ownership, privacy, or external cost.
- Use Zod schemas at API and agent-tool boundaries.
- Record user-visible mutations as application events.
- Do not let an LLM write SQL, invent resume facts, or perform unconfirmed destructive actions.
- Preserve source URLs, retrieval date, and fact-versus-inference distinction for web research.
- Do not begin implementation if the feature spec lacks acceptance criteria.

## Artifact rules

- Use the next unused `F-XXX` id from `specs/features/`.
- State exclusions explicitly in every feature spec.
- Treat contracts as the source of truth for data, APIs, and agent inputs/outputs.
- Keep plans implementation-oriented and tasks independently verifiable.

## Templates

Read [feature-template.md](references/feature-template.md), [plan-template.md](references/plan-template.md), and [tasks-template.md](references/tasks-template.md) before creating the corresponding artifacts.
