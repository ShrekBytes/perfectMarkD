import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMermaid, resetMermaidForTests } from './mermaid';

const { initializeMock, renderMock } = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: { initialize: initializeMock, render: renderMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetMermaidForTests();
  renderMock.mockImplementation(async (id: string, code: string) => ({
    svg: `<svg data-id="${id}">${code}</svg>`,
  }));
});

describe('renderMermaid hook', () => {
  it('renders a fence source to SVG and initializes mermaid once', async () => {
    await expect(renderMermaid('graph TD\n    A --> B')).resolves.toContain(
      '<svg',
    );
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('caches by source so repeated renders reuse the SVG', async () => {
    const first = await renderMermaid('graph TD\n    A --> B');
    const second = await renderMermaid('graph TD\n    A --> B');
    const other = await renderMermaid('graph LR\n    A --> B');

    expect(second).toBe(first);
    expect(other).not.toBe(first);
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  it('lets a failed diagram retry instead of caching the rejection', async () => {
    renderMock.mockRejectedValueOnce(new Error('bad diagram'));

    await expect(renderMermaid('graph TD\n    broken')).rejects.toThrow(
      'bad diagram',
    );
    await expect(renderMermaid('graph TD\n    broken')).resolves.toContain(
      '<svg',
    );
    expect(renderMock).toHaveBeenCalledTimes(2);
  });
});
