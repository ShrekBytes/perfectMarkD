// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import { ExportPage } from './ExportPage';
import {
  EXPORT_DONE_FUNCTION,
  EXPORT_READY_FLAG,
  EXPORT_RENDER_MESSAGE,
} from './protocol';

afterEach(() => {
  cleanup();
  delete window[EXPORT_READY_FLAG];
  delete window[EXPORT_DONE_FUNCTION];
  // A render paints the export document over this one (Page.pdf prints the
  // main frame), which leaves jsdom without usable head/body pointers —
  // rebuild a blank document for the next test.
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body'),
  );
});

const flush = (ms = 50) => new Promise((r) => setTimeout(r, ms));

/** Dispatches a MessageEvent the way a real same-window postMessage looks.
 *  jsdom's own postMessage sets origin to "" and source to a wrapper, which
 *  the component (correctly) rejects — real Chromium sets both properly. */
function postRenderMessage(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      origin: window.location.origin,
      data,
    }),
  );
}

it('is blank, noindex, and signals readiness once listening', () => {
  const { container } = render(<ExportPage />);
  expect(container.textContent).toBe('');
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex',
  );
  expect(window[EXPORT_READY_FLAG]).toBe(true);
});

it('removes the flag and meta tag on unmount', () => {
  const { unmount } = render(<ExportPage />);
  unmount();
  expect(window[EXPORT_READY_FLAG]).toBe(false);
  expect(document.querySelector('meta[name="robots"]')).toBeNull();
});

it('renders on the agreed message and reports via the done callback', async () => {
  const done = vi.fn();
  window[EXPORT_DONE_FUNCTION] = done;
  render(<ExportPage />);

  postRenderMessage({
    type: EXPORT_RENDER_MESSAGE,
    payload: {
      title: 'T',
      markdown: '# H',
      settings: { ...DEFAULT_SETTINGS },
      assets: {},
    },
  });
  await flush();

  expect(done).toHaveBeenCalledTimes(1);
  const result = done.mock.calls[0]![0];
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.pageCount).toBe(1);
  expect(document.querySelector('.mpdf-export-page')).toBeTruthy();
});

it('ignores foreign messages and wrong message types', async () => {
  const done = vi.fn();
  window[EXPORT_DONE_FUNCTION] = done;
  render(<ExportPage />);

  postRenderMessage({ type: 'something-else', payload: {} });
  postRenderMessage('not an object');
  // A real cross-origin frame: right shape, wrong source origin.
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      origin: 'https://evil.example',
      data: { type: EXPORT_RENDER_MESSAGE, payload: {} },
    }),
  );
  await flush();

  expect(done).not.toHaveBeenCalled();
  expect(document.querySelector('.mpdf-export-page')).toBeNull();
});
