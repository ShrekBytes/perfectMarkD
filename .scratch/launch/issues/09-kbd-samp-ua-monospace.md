# 09 — `<kbd>`, `<samp>` and `<tt>` render in the host's monospace

Status: resolved
Blocked by:

Found while auditing for the defect class [launch/07](07-goldens-on-the-runner.md)
fixed: an element the doc CSS gives no font falls through to the UA
stylesheet's `monospace`, so its metrics come from the host while everything
around it comes from the Document.

`buildDocCSS` gives `pre` and `code` the Document's code font and leaves `kbd`,
`samp` and `tt` alone. Chromium's UA stylesheet puts `monospace` on all five,
so those three measure in whatever monospace the machine has. Measured, not
reasoned — one of each rendered inside the real doc CSS:

```
code = "IBM Plex Mono"        kbd  = monospace
pre  = "IBM Plex Mono"        samp = monospace
                              tt   = monospace
```

Every other element checked (headings, `p`, `strong`/`b`, `em`/`i`, `del`/`s`,
`mark`, `sub`, `sup`, `small`, `abbr`, `q`, `cite`, `var`, `a`, `span`, `li`,
`blockquote`) inherits the Document's stack and is unaffected.

`markdown-it` runs with `html: true` (`render.ts`), so a Document can carry
`<kbd>Ctrl</kbd>` without any markdown syntax producing it — and this product's
audience writes exactly that. Two consequences, both of which launch/07 named:

- the export stops being a function of the Document and the pinned Chromium,
  which is the coupling launch/07 removed everywhere else;
- the element renders in a different typeface from the `code` beside it.

**Accepts**: `kbd`, `samp` and `tt` render in the Document's code font, and a
test fails if any element the renderer can emit resolves its font through a
generic family — the fixture-based guard launch/07 added covers only the
elements its fixtures happen to contain, which is why it did not catch this.

## Comments

- **Filed and resolved (2026-09-26).** The fix is the `kbd`/`samp`/`tt` rule in
  `buildDocCSS`, font-family only: the engine styles `code`, and whether these
  should *look* like it — background, padding, the code font size — is a design
  question rather than a determinism one, so it is left alone deliberately.
  They now take the Document's code font, which is also the setting a reader
  would expect to govern keyboard and terminal text.

- **The guard is the point of the ticket, not the rule.** launch/07's
  `expectSoundLayout` audits the *golden documents'* export HTML, so it can
  only see elements those fixtures contain — and no fixture has a `<kbd>`. The
  new `packages/core/src/golden/ua-fonts.test.ts` builds a document from every
  element the engine's CSS is expected to meet, including the ones no fixture
  uses, and fails if any resolves through a generic family. That is the check
  that would have caught `pre` and `kbd` alike.

- **Verified.** The new test fails on the pre-fix CSS with `KBD { font-family:
  monospace }`, `SAMP …` and `TT …` named, and passes after it. The full golden
  suite and the repo-wide unit suite are green.

- **Not in the audit, deliberately.** Form controls (`input`, `select`,
  `textarea`, `button`) take a *named* UA family (`Arial`) rather than a
  generic one, so the check as written cannot see them; the renderer emits only
  a task-list checkbox, which paints no text. Recorded so the gap is a decision
  rather than an oversight.
