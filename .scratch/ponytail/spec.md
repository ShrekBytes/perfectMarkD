# Ponytail: repo-wide over-engineering sweep

Status: ready-for-agent

## Problem Statement

A whole-repo ponytail audit (2026-09-29) found roughly 750 removable lines
across the three packages. The dominant pattern is copy-pasted plumbing:
four outbound HTTP clients each re-implement the AbortController/timeout/
AbortError dance, the admin routes repeat their prelude six times and their
audit-log insert seven times, five components duplicate the outside-click
dismissal effect, and the two export hooks each carry a byte-identical toast
hook. Behind that sit dead exports (`PRESET_COLOR_KEYS`, `FileTextIcon`,
`HistoryStore.read()`, `paginateEl`), a dead script
(`scripts/mock-ai-provider.mjs`, referenced by nothing), hand-rolled blocks
with table-shaped replacements, and a core public surface where 46% of the
107 exported symbols are never imported outside the package. Nothing here is
a correctness, security, or performance finding, and **no dependency is
removable** — every dependency in all three package.json files has verified
import sites and earns its keep.

## Solution

Three package-grouped tickets, landed as sequential waves: server first
(01), core second (02), web third (03). Each ticket bundles its package's
findings into one mechanical, no-behavior-change sweep sized for a single
context window. Every item is independently verifiable by the existing unit
suites; the core sweep is additionally guarded by the paginator goldens and
the web sweep by the visual e2e baselines.

## Decisions recorded at breakdown time

- **The fetch/timeout dedup supersedes email/01's recorded decision in a
  narrow way.** email/01 deliberately kept the Resend client's transport
  boilerplate separate from `ai/provider.ts` ("different error vocabularies,
  five knobs, feature coupling"). That reasoning is respected: the sweep
  shares only the mechanics — the abort/timeout dance, `isAbortError`, and
  the `readDetail` cap — while each client keeps its own error vocabulary
  and response reader. What tipped the balance is `rate/provider.ts`
  (live-pricing/02): a third and fourth copy of the mechanics appeared
  *after* the decision, so the "leave as N bodies" line was already broken.
- **The version.ts merge is approved.** One `buildInfo(source)` in core
  serves web (`import.meta.env`) and server (`process.env`); the ~12-line
  parallelism is not worth keeping once the sweep is touching both files
  anyway.
- **`identities.email`/`createdAt` stay.** The schema comment records them
  as intentional provenance; only the write-only timestamp columns
  (`entitlements.updated_at`, `settings_kv.updated_at`) are dropped.
- **Test-fixture relocation is included** in the web sweep: production-file
  exports whose only consumers are their own tests move into those tests.

## Non-goals

- No dependency additions or removals (none are possible).
- No performance, security, or correctness work — anything of that kind
  surfaced during the sweep routes to a normal review pass, not this spec.
- No behavior change anywhere, and no core public-API growth beyond the one
  export the findings name (`countOccurrences`, already private in core and
  mirrored verbatim in the web app).

## Tickets

- `01-server-sweep.md` — fetch mechanics helper, admin route helpers, AI
  route skeleton, burst-limiter merge, small cuts, write-only columns, one
  feature flag. Blocked by: none.
- `02-core-sweep.md` — dead exports, right-sized API surface, `dom.ts`
  inline, structural shrinks, `paginateEl` removal, `buildInfo` merge.
  Blocked by: 01.
- `03-web-sweep.md` — table-driven inspector sections, shared interaction
  plumbing, small cuts, fixture relocation, `countOccurrences` adoption.
  Blocked by: 02.
