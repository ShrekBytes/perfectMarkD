# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

Read the ones that bear on the work, in this order:

- **`CONTEXT.md`** — the canonical glossary. Use its terms verbatim; see "Use the glossary's vocabulary" below.
- **`docs/adr/`** — the numbered decision log, one file per decision. Read the ADRs that touch the area you are about to work in, and read one before overriding any. `AGENTS.md` names the current range.
- **`docs/agents/`** — this file, plus `issue-tracker.md` (tracker conventions) and `triage-labels.md` (the `Status:` vocabulary).
- **`apps/web/DESIGN.md`** — the binding visual system. `AGENTS.md` and `PLAN.md` both defer to it, and both say to fix one side or the other when they disagree. Never leave both.
- **`apps/web/PRODUCT.md`** — product scope and the WCAG 2.2 AA target.
- **`docs/ops/`** — five runbooks: `admin.md` (verifying a payment, resetting a password, changing a wallet), `restore.md` (backup and recovery), `hosting.md` (what the stack does not need), `launch-checklist.md` and `announcements.md` (going live).
- **`packages/core/src/golden/README.md`** — the paginator's regression net. Read it before touching the paginator.

If any of these files do not exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

The two trees below are *shapes*, not this repository's layout. This repository's real locations are the list above.

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
