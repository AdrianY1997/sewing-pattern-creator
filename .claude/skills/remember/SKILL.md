---
name: remember
description: >
  Store a fact in this project's recall memory so it surfaces in future sessions.
  Use when the user says /remember, "remember this", "recuerda esto", "no olvides
  que", or corrects you in a way that should stick. Also use when you learn a
  non-obvious project fact worth keeping.
---

# /remember

Write one fact to `.recall/`. One fact per node — if the user gave you three
things, write three nodes.

## Is it actually a memory?

The test: **will this still be true and useful in a month?** A store full of
near-misses is worse than a small store, because every wrong entry costs a real
injection slot.

Not memories:
- Task progress ("finished the clients module"). If a checkpoint genuinely helps,
  use `type: state` — it expires in 7 days by itself.
- A restatement of a change just made ("added validation to the booking form").
- Anything obvious from reading the code.
- Generic best practice not specific to this project.

Real memories: a decision and why the alternative lost, a trap that cost time, a
convention someone would otherwise violate, a constraint imposed from outside
(a vendor limit, a client requirement, a legacy quirk).

When the user asks you to remember something from the first list, say what you
would store instead and confirm — usually the durable fact hiding behind it.

## Choose the type

| Type | For | Approval |
|---|---|---|
| `convention` | how this project does things ("migrations run via drizzle-kit") | auto |
| `gotcha` | a trap that cost time ("Netlify hosts no database") | auto |
| `pattern` | a reusable approach with an implementation | auto |
| `reference` | a pointer to an external resource, dashboard, ticket | auto |
| `state` | where work was left off — expires in 7 days | auto |
| `preference` | how the **user** wants you to work | needs approval |
| `decision` | a choice made with alternatives and trade-offs | needs approval |
| `feedback` | a correction that should change future behaviour | needs approval |

## Write it

```
node "E:/Trabajo/recall/bin/recall.js" write --type gotcha \
  --title "Netlify does not host databases" \
  --trigger netlify --trigger hosting --trigger "base de datos" --trigger database \
  --anchor "netlify.toml#build" \
  --source user --stdin-body
```

Pass the body on stdin. Keep it under ~800 tokens: the *why* and the *how to
apply*, then any `[[related-node]]` links.

## Rules that matter

- **Title = a complete fact.** `"Use Drizzle, not Prisma"`, never `"ORM choice"`.
  The title is what gets injected into context, so it must answer the question
  by itself. This is the single most important thing on this page.
- **Triggers in Spanish and English.** At least 2, ideally 4–6, using the words
  someone would really type — `moneda`, `currency`, `precio`, `formato`, `cop`.
  Recall is lexical, so a fact with lazy triggers is a fact nobody finds.
- **Anchor when the fact is tied to code**: `--anchor "path#symbol"`, where the
  symbol would vanish if the fact stopped being true. That is what makes staleness
  detectable.
- **`--pin` only for the handful of facts that are always relevant.** Pinned
  memories are injected at every session start and share a ~300 token budget.
- **`--scope global`** for facts true across all the user's projects (their
  preferences, their environment); default `project` otherwise; `local` for
  personal notes that should not be committed.

## When the CLI says `needs approval`

That is the design, not a failure. It fires for `preference`, `decision`,
`feedback`, and for anything colliding with an existing memory. Show the user
what would be written and what it would supersede, then re-run with `--approved`
once they confirm. Never pass `--approved` on your own initiative.

If it reports a conflict with an existing node, read that node first. Usually the
right move is to supersede it rather than add a second, contradictory memory:

```
node "E:/Trabajo/recall/bin/recall.js" write --type convention --title "<new fact>" \
  --trigger ... --supersedes <old-node-id> --approved
```

## Afterwards

Confirm in one line: what was stored, its id, and whether anything was superseded.
No lecture.
