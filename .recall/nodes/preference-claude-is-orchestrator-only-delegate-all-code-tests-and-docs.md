---
id: preference-claude-is-orchestrator-only-delegate-all-code-tests-and-docs
type: preference
scope: project
title: Claude is orchestrator only: delegate all code, tests and docs to subagents
triggers: ["orquestador","orchestrator","subagente","subagent","delegar","delegate","tokens"]
anchors: []
asserted: 2026-10-24
invalidated: null
superseded_by: null
confidence: medium
pin: true
source: user
---
In sewing-pattern-creator the main Claude session only thinks, plans and decides.
All execution is delegated to subagents: writing/editing code, tests of any kind
(smoke, live, Playwright MCP, unit), and documentation.

**Why:** the user wants to optimize tokens and keep reasoning separate from execution.

**How to apply:** pick the agent type and reasoning effort per task (low effort for
mechanical edits, docs and smoke checks; higher effort for tricky logic or
debugging). Give each subagent a self-contained brief (files, acceptance criteria),
then review its report and decide next steps. Don't write files or run tests directly.
