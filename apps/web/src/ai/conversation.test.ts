import { describe, expect, it } from 'vitest';
import {
  MAX_TURNS,
  capTurns,
  createStylesheetConversation,
  recentExchanges,
  previewReply,
  type StylesheetTurn,
} from './conversation';

function proposal(id: number, reply: string): StylesheetTurn {
  return {
    id,
    instruction: `ask ${id}`,
    against: '',
    status: 'proposal',
    reply,
    decision: null,
  };
}

/** The same turn once the user has decided it. */
function decided(
  id: number,
  reply: string,
  decision: 'accepted' | 'rejected',
): StylesheetTurn {
  return { ...proposal(id, reply), decision } as StylesheetTurn;
}

describe('the conversation cap', () => {
  it('keeps the newest turns and drops the oldest', () => {
    const turns: StylesheetTurn[] = Array.from(
      { length: MAX_TURNS + 5 },
      (_, index) => ({
        id: index,
        instruction: `ask ${index}`,
        against: '',
        status: 'working',
      }),
    );
    const capped = capTurns(turns);
    expect(capped).toHaveLength(MAX_TURNS);
    expect(capped[0]!.id).toBe(5);
    expect(capped.at(-1)!.id).toBe(MAX_TURNS + 4);
  });

  it('leaves a short log alone', () => {
    const turns: StylesheetTurn[] = [
      { id: 1, instruction: 'a', against: '', status: 'working' },
    ];
    expect(capTurns(turns)).toBe(turns);
  });
});

describe('the exchanges a request replays', () => {
  it('sends the last three proposals, oldest first', () => {
    const turns: StylesheetTurn[] = [
      proposal(1, 'a {}'),
      {
        id: 2,
        instruction: 'failed',
        against: '',
        status: 'failed',
        error: 'nope',
      },
      proposal(3, 'b {}'),
      proposal(4, 'c {}'),
      proposal(5, 'd {}'),
    ];
    expect(recentExchanges(turns)).toEqual([
      { instruction: 'ask 3', reply: 'b {}' },
      { instruction: 'ask 4', reply: 'c {}' },
      { instruction: 'ask 5', reply: 'd {}' },
    ]);
  });

  it('has nothing to replay before the first reply', () => {
    expect(
      recentExchanges([
        { id: 1, instruction: 'a', against: '', status: 'working' },
      ]),
    ).toEqual([]);
  });
});

describe('the provisional preview', () => {
  it('follows the newest proposal while it is undecided', () => {
    expect(previewReply([proposal(1, 'a {}'), proposal(2, 'b {}')])).toBe(
      'b {}',
    );
  });

  it('hands the paper back once the newest proposal is decided', () => {
    expect(
      previewReply([proposal(1, 'a {}'), decided(2, 'b {}', 'rejected')]),
    ).toBeNull();
    expect(
      previewReply([proposal(1, 'a {}'), decided(2, 'b {}', 'accepted')]),
    ).toBeNull();
  });

  it('never resurrects an older undecided proposal', () => {
    // Two turns left undecided is what a Retry, or a second question asked
    // before deciding, leaves behind. Deciding the newer one must not put the
    // older look back on the paper — nobody is offering it any more.
    const turns: StylesheetTurn[] = [
      proposal(1, 'a {}'),
      decided(2, 'b {}', 'accepted'),
    ];
    expect(previewReply(turns)).toBeNull();
  });

  it('previews nothing while a turn is still running or has failed', () => {
    expect(
      previewReply([
        proposal(1, 'a {}'),
        { id: 2, instruction: 'again', against: '', status: 'working' },
      ]),
    ).toBeNull();
    expect(
      previewReply([
        proposal(1, 'a {}'),
        {
          id: 2,
          instruction: 'again',
          against: '',
          status: 'failed',
          error: 'nope',
        },
      ]),
    ).toBeNull();
  });

  it('has nothing to preview without a Document', () => {
    expect(previewReply(undefined)).toBeNull();
    expect(previewReply([])).toBeNull();
  });
});

describe('the conversation store', () => {
  it('runs a turn from instruction to proposal to decision', () => {
    const { useStore } = createStylesheetConversation();
    const id = useStore
      .getState()
      .start('doc-a', 'thinner rules', 'h1 { border: 3px; }');
    expect(useStore.getState().turns['doc-a']).toEqual([
      {
        id,
        instruction: 'thinner rules',
        against: 'h1 { border: 3px; }',
        status: 'working',
      },
    ]);

    useStore.getState().resolve('doc-a', id, 'h1 { border: 0; }');
    expect(useStore.getState().turns['doc-a']).toEqual([
      {
        id,
        instruction: 'thinner rules',
        against: 'h1 { border: 3px; }',
        status: 'proposal',
        reply: 'h1 { border: 0; }',
        decision: null,
      },
    ]);

    useStore.getState().decide('doc-a', id, 'rejected');
    // A decided turn stays in the log, so the next instruction can refer to it.
    expect(useStore.getState().turns['doc-a']![0]).toMatchObject({
      status: 'proposal',
      reply: 'h1 { border: 0; }',
      decision: 'rejected',
    });
  });

  it('keeps the instruction when a turn fails', () => {
    const { useStore } = createStylesheetConversation();
    const id = useStore.getState().start('doc-a', 'thinner rules', '');
    useStore.getState().fail('doc-a', id, 'The AI is unavailable right now.');
    expect(useStore.getState().turns['doc-a']).toEqual([
      {
        id,
        instruction: 'thinner rules',
        against: '',
        status: 'failed',
        error: 'The AI is unavailable right now.',
      },
    ]);
  });

  it('scopes the log to the Document', () => {
    const { useStore } = createStylesheetConversation();
    const a = useStore.getState().start('doc-a', 'for a', '');
    useStore.getState().resolve('doc-a', a, 'a {}');
    const b = useStore.getState().start('doc-b', 'for b', '');
    useStore.getState().resolve('doc-b', b, 'b {}');

    expect(useStore.getState().turns['doc-a']).toHaveLength(1);
    expect(useStore.getState().turns['doc-b']).toHaveLength(1);
    expect(useStore.getState().turns['doc-a']![0]).toMatchObject({
      instruction: 'for a',
    });
  });

  it('starts empty on a new session — nothing survives a reload', () => {
    const first = createStylesheetConversation();
    first.useStore.getState().start('doc-a', 'thinner rules', '');
    const second = createStylesheetConversation();
    expect(second.useStore.getState().turns).toEqual({});
  });
});
