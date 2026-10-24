---
name: audit
description: >
  Review the code changed in the current task with a fresh agent, audit it
  against this project's stored conventions, and capture what was learned as
  memory. Use when the user runs /audit, says a task is finished, or asks for a
  review of recent work. Also use when the session-start or stop hook reports
  unaudited edits.
---

# /audit

Spawn the `recall-auditor` agent. It gathers its own inputs — do **not** paste
diffs, file contents, or context into its prompt. Fresh context is the entire
reason it exists: passing it your reasoning would reintroduce the bias it is
there to avoid.

## First decide whether an audit is even the right move

The audit needs a diff, and memory needs a *durable* fact. Not every kind of work
has both.

| Work | Do this |
|---|---|
| Feature, bug fix, tests | Audit normally. Bug fixes yield the highest-value memories (`gotcha`). |
| Refactor | Audit **with an explicit scope**, then `verify` — see below. |
| Debugging or investigation with no code change | **Do not audit.** There is no diff. Offer `/remember` for what was learned. |
| Config, infra, deploy, dependency bumps | Audit is weak here (little logic to be wrong). The value is the memory — prefer `/remember` for the gotcha. |
| Spike or throwaway code | **Skip both.** Enforcing project conventions on code that is about to be deleted produces noise and a store full of facts that were never true. |
| Docs only | Skip. |

## Steps

1. Check what is pending, so you know whether there is anything to audit:

   ```
   node "E:/Trabajo/recall/bin/recall.js" pending
   ```

   Nothing pending and no recent edits → tell the user there is nothing to audit
   and stop. Do not spawn the agent to review nothing.

2. Spawn the agent with `subagent_type: "recall-auditor"`, `run_in_background:
   false`. Keep the prompt short — scope only:

   > Audit the work completed in this task. Scope: `<subsystem or "the pending
   > files">`. Gather the diff, this project's stored conventions, and the
   > recurring-findings list yourself, then report findings and capture memories
   > per your instructions.

   If the user named a scope (`/audit the clients module`), pass it through. If
   they asked for a thorough pass, say so — that is what unlocks `🔵 nit`
   findings.

   **A large change must be scoped, not handed over whole.** A 40-file rename
   overflows the agent's context and comes back as noise. If `pending` shows more
   than ~10 files, or the diff is mostly mechanical, either take the subsystem the
   user named or split it into two runs by area — and say which part you audited.
   Never let it review "everything" and hope.

3. Relay the agent's output to the user **verbatim**. It is already compact:
   one line per finding plus a `totals:` line plus the receipt. Do not summarize
   it, re-rank it, or soften it. Do not add "overall the code looks solid".

4. If the receipt lists proposals awaiting approval, show them and ask whether to
   accept. On approval, re-run the exact command from
   `.recall/local/proposals.md` with `--approved` added.

5. Offer to fix `🔴` findings. Do not fix them unprompted — the user may want to
   see the list first.

## After a refactor, always re-verify

A refactor is the one case where memory can become actively **false**: symbols get
renamed or moved, so the anchors that made a fact checkable stop pointing at
anything. Finish with:

```bash
node "E:/Trabajo/recall/bin/recall.js" verify
```

Then handle what it reports:

- **Anchor broke but the fact is still true** (file moved, symbol renamed) →
  rewrite the node with the corrected `--anchor`.
- **The fact itself is no longer true** — which is often the whole point of the
  refactor → `--supersedes <old-id>` with the new fact. Never write a second node
  that contradicts the first; that is exactly the contradiction-accumulation
  failure this store is built to prevent.
- **Stale and no longer relevant at all** → `undo` it.

`verify` is cheap and deterministic — no model, no tokens. Run it after any change
that moves code around, not only after a formal "refactor".

## Do not

- Do not audit inline yourself. The whole value is the fresh context.
- Do not run the auditor twice for the same changes.
- Do not `--approved` a proposal on the user's behalf. Preferences, decisions,
  feedback and supersessions are theirs to confirm.
