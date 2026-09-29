# 03: Dead exports and structural shrinks (core)

**What to build:** the engine's public surface stops advertising things nobody
asks for, and the three places it does the same work twice do it once. Two
settings fields exist that no control writes and no engine code reads; two
band-style helpers are zero-argument functions returning a constant; a
golden-harness option has exactly one legal value; and the two splitters that
count how much fits on a page run the same loop character for character.

After this ticket, a symbol carrying `export` in this package means something
reaches for it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Every `export` keyword this ticket drops is dropped only after checking
      the whole repository — web, server, core, unit tests and e2e — for an
      import site, and the removals are recorded.
- [ ] The exported types that exist only as their own function's parameter or
      return annotation stop being exported. Roughly a dozen of them, across
      the render, export-HTML, paginator, AI and styling-reference modules.
- [ ] The golden harness's internals go private. Its regression net's surface
      is the four functions its suites actually import; its URL builders,
      math-CSS builders and page accessor are not part of it. The bundled-font
      table constants go private the same way, and the document-helper that
      only its own module calls with it.
- [ ] The two settings fields no control writes and no engine code reads are
      gone, along with their defaults, their validation clamps and the CSS
      interpolations that therefore always emitted zero. **No setting with a
      real control behind it is touched** — this is scoped to the two that
      have neither.
- [ ] The two band-style helpers that take no arguments and return a constant
      become constants. All the numbers in them come from CSS custom
      properties, so the emitted stylesheet is byte-identical.
- [ ] The golden run option whose only two reads are "is this exactly false"
      ternaries, and which no caller ever passes, is gone. The branch it
      guarded keeps its default behavior.
- [ ] The two splitters that count how many children fit on a page share one
      counting helper. The pre splitter is a genuine variant and is left
      alone — the ticket states which two are the copies rather than making
      the next agent re-derive it.
- [ ] The diagram renderer is declared as a development dependency of this
      package. Its only import site is the golden harness; nothing a consumer
      of the built engine loads pulls it in. The lockfile and the build's
      external list both stay correct afterwards.
- [ ] The barrel surface guard is repaired. It currently asserts that three
      symbols are absent from the public surface — all three deleted by the
      previous sweep, so it asserts nothing. The ghosts are replaced with
      internal names that exist, so the guard guards again.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green; the full unit
      suite green.
- [ ] The paginator goldens pass **without snapshot updates**. If a golden
      moves, that is a rendered change this ticket did not intend — stop and
      investigate rather than running the update.

## Comments

- The golden suite is the engine's regression net and this ticket touches the
  paginator inside it. That is the reason for the no-snapshot-updates clause,
  and the reason the splitters' copy/variant distinction is written into the
  acceptance criteria rather than left to the implementer.
