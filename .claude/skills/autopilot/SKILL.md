---
name: autopilot
description: >
  Governs multi-part work end-to-end without a check-in after every step: plan
  the parts, implement each one, validate it with the same fresh-context audit
  /audit already uses, checkpoint progress in memory, and move to the next
  part — pausing only when something genuinely needs the user's approval or
  touches a risky/irreversible action. Use proactively whenever a request
  describes several distinct, sequenceable pieces of work (a feature spanning
  backend+frontend+tests, a multi-file migration, "do A, then B, then C"), not
  just when the user runs /autopilot. Do not use for a single well-scoped
  change, a question, or work the user asked to walk through step by step.
---

# /autopilot

This is not a fourth role added on top of `/audit`. It is `/audit` (and
`/remember`'s approval rules) run on a schedule you manage across several
parts of one task, instead of waiting for the user to type the command after
each one. If you find yourself inventing separate "tester", "reviewer", and
"verifier" passes, stop — `recall-auditor` already does all three in one
fresh-context pass. Duplicating it costs more tokens for no better coverage.

## 0. Check whether this project even wants it

Read `.recall/config.json`. If it has no `autopilot` key, treat it as
enabled (older installs predate this key). If `autopilot.enabled` is
explicitly `false`, do not self-engage for a multi-part task — work normally,
one step at a time, checking in as usual. The user can still ask for
`/autopilot` by name for a single run even when the project default is off.

If there's no `.recall/` store at all, this skill has nothing to checkpoint
against — fall back to `EnterPlanMode`/normal step-by-step work instead.

## 1. Decide whether the task actually qualifies

| Task shape | Do this |
|---|---|
| Several distinct parts that would otherwise mean stopping after each one to ask "continue?" | Run the loop below. |
| One well-scoped change, even if it touches several files | Just do it. Don't wrap a single part in ceremony. |
| A question, an explanation, "what do you think" | Answer directly. This skill is for execution, not exploration. |
| The user asked to go step by step / wants to review each part | Respect that — don't override an explicit request for tighter control. |

## 2. Plan, then write the checkpoint

Break the objective into an ordered list of parts. Before implementing
anything, write the tracker as a `state` node — this doubles as the
Tracker+Checkpoint and the recovery anchor if the session gets interrupted:

```
node "E:/Trabajo/recall/bin/recall.js" write --type state --title "autopilot: <objective, stays fixed all run>" \
  --trigger autopilot --trigger checkpoint --source autopilot --stdin-body
```

Body: the numbered part list with a status per part (`pending` /
`in-progress` / `done` / `skipped`) and one line on what's next. **Keep the
title identical on every update** — that is what makes this a cheap update to
the same node instead of a second checkpoint needing approval as a
supersession. Only the body changes as parts complete.

## 3. Resuming an interrupted run

`session-start` surfaces a live `autopilot:` checkpoint automatically if one
exists. If you see that banner, read the node it points at, resume from the
first part still `pending`/`in-progress` — do not restart finished parts, and
do not silently re-plan; if the plan no longer fits what you find in the
code, stop and confirm the new plan with the user first (see §5).

## 4. The loop, per part

1. **Implement.** Do it directly, or delegate to `Agent` when the part is
   large or independent enough to deserve its own context — the same
   judgment call you'd make for any task, not a rule to always spawn one.
2. **Decide if it needs an audit**, using `/audit`'s own table: feature/bugfix/
   tests → audit; refactor → audit, then `node "E:/Trabajo/recall/bin/recall.js" verify`;
   investigation-only, config/infra-only, spike, or docs-only → skip, per
   that skill's rules.
3. **If it needs an audit**, spawn `recall-auditor` exactly as `/audit`
   does — fresh context, gathers its own diff and conventions. Do not paste
   context into its prompt. Do not run it twice for the same part.
4. **Handle findings**: 🔴/🟡 that are unambiguous and in-scope — fix, then
   move on. Anything ❓, anything the auditor proposed that needs approval
   (`preference`/`decision`/`feedback`, or a supersession), or a finding you
   are not confident fixing correctly → stop and follow §5, do not guess.
5. **Update the checkpoint** (§2's node, same title, new body): mark the part
   done, note the memories written, keep going to the next part without
   asking "should I continue?" — that question is exactly what this skill
   exists to stop asking after every single part.

## 5. Where autonomy stops — ask, don't guess

Pause and use `AskUserQuestion` (or plain confirmation for a smaller thing)
when:

- Recall reports `needsApproval` for anything the loop tried to write —
  never pass `--approved` yourself, same rule as `/audit` and `/remember`.
- The next step is destructive or hard to reverse, or touches shared state
  (force-push, deleting a branch, dropping a schema, sending a message,
  posting externally, closing a PR) — autopilot does not grant itself any
  authority beyond what any other work in this session already has.
- There's a real architectural fork with no clearly-better default. Ask
  once, then carry that decision through the rest of the run without asking
  again for the same kind of choice.
- A part reveals the original plan doesn't fit reality — stop and replan
  with the user rather than improvising a large change of direction
  silently.
- Guessing wrong would waste a whole part's worth of work.

Everything else — keep going. Re-confirming after every part is the ChatGPT-
style pattern this is deliberately avoiding; it doesn't save tokens (more
check-ins mean more, not fewer, context round-trips) and it defeats the point
of the mode.

## 6. Finishing

After the last part:

```
node "E:/Trabajo/recall/bin/recall.js" verify
```

If the whole run's diff is still small enough to scope as one thing and
wasn't already fully covered part-by-part, run one last `recall-auditor`
pass over what's left uncovered — don't re-audit files already audited in an
earlier part. Then archive the checkpoint so it stops showing up at session
start:

```
node "E:/Trabajo/recall/bin/recall.js" undo <checkpoint-id>
```

Report a compact summary, same tone as `/audit`'s receipt — no padding:
parts completed, audits run, memories written, anything still waiting on
approval in `.recall/local/proposals.md`.

## Do not

- Do not split validation into separate tester/reviewer/verifier agents —
  `recall-auditor` is that, already, in one pass.
- Do not auto-approve anything recall flags as needing approval.
- Do not expand scope beyond the parts the user actually described.
- Do not keep more than one live checkpoint — always update the same node.
- Do not run silently when `.recall/config.json` sets `autopilot.enabled: false`.
