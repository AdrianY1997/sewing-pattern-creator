---
name: init
description: >
  One-time, expensive first pass to populate memory for a project that
  already has real code: reads the whole codebase (not a diff) and writes
  the initial batch of memory nodes, then reconciles AGENTS.md/CLAUDE.md.
  Use when the user runs /init, or asks to "bootstrap"/"seed"/"populate"
  recall's memory for an established project. Never run this as a side
  effect of another request, and never run it silently.
---

# /init

This is not `/audit` with a bigger scope. `/audit` reviews a diff and costs a
few thousand tokens in a throwaway subagent context. `/init` reads most or all
of a real codebase and can cost an order of magnitude more, in both tokens and
wall time, depending on project size. Say this plainly to the user before doing
anything else — do not let the cost be a surprise after the fact.

## 1. Check whether this is actually a first pass

```bash
node "E:/Trabajo/recall/bin/recall.js" stats --json
```

- **Empty or near-empty store** → this is the real case `/init` is for.
  Continue.
- **Already has a meaningful number of live nodes** → this project has been
  accumulating memory normally. Tell the user what `stats` shows and ask
  whether they want a full re-scan anyway, or a narrower supplemental pass
  (a specific subdirectory or subsystem) instead of repeating work `/audit`
  has already been doing for free.

## 2. State the cost, then confirm

Tell the user, concretely:
- This reads the real architecture, docs, and a representative sample of
  every top-level module — not everything line by line, but nothing skipped
  at the survey level.
- It writes memory nodes as it goes, and may propose corrections to
  AGENTS.md/CLAUDE.md if what they claim doesn't match the current code.
- It is a deliberate, standalone task, not something to squeeze into an
  unrelated turn.

Get an explicit go-ahead before spawning the agent. If the project is large
enough that even a survey pass would be very expensive (a big monorepo), ask
whether to scope to one part of it first.

## 3. Spawn the agent

`subagent_type: "recall-initializer"`, `run_in_background: false` — the user
is waiting for this one, unlike a normal `/audit` that can run alongside other
work. Keep the prompt short: the scope (whole project, or the subdirectory
agreed in step 2) and nothing else. It gathers everything itself.

## 4. Relay the result verbatim

Same rule as `/audit`: the report is already compact. Do not summarize it,
soften it, or add "overall this looks good." If it lists proposals awaiting
approval (preferences, decisions, anything that would supersede an existing
node — unlikely on a true first pass, but check), show them and ask.

If it made changes to AGENTS.md/CLAUDE.md, point the user at the diff
(`git diff AGENTS.md CLAUDE.md` if this is a repo) rather than just trusting
the receipt — these are the project's own governance files, worth a human
look before moving on.

## After this

Normal workflow takes over: `/audit` after each task, `/remember` for a fact
on the spot. Don't run `/init` again unless the user explicitly asks for it —
if they do, ask why (a rewrite that invalidated a lot of memory at once is a
better fit for `/audit --scope` plus `recall verify` than for repeating the
whole survey).
