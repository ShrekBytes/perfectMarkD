// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as dbApi from '../documents/db';
import { SAMPLE_NAME } from '../documents/sample';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';
import { WelcomeStrip } from './WelcomeStrip';

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the strip while the auto-created sample is open', () => {
  render(<WelcomeStrip />);

  expect(screen.getByTestId('welcome-strip')).toBeInTheDocument();
  expect(
    screen.getByText('This is a sample — edit or clear it.'),
  ).toBeInTheDocument();
  expect(screen.getByTestId('start-blank')).toBeEnabled();
});

it('hides while the store is loading', () => {
  cleanup();
  resetDocumentStoreForTests();
  render(<WelcomeStrip />);

  expect(screen.queryByTestId('welcome-strip')).not.toBeInTheDocument();
});

it('Start blank dismisses and opens a fresh blank document', async () => {
  render(<WelcomeStrip />);
  await userEvent.click(screen.getByTestId('start-blank'));

  // The handler dismisses, persists that, then creates the blank document.
  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toBe('');
  });

  const state = useDocumentStore.getState();
  expect(state.sampleDismissed).toBe(true);
  expect(state.name).toBe('Untitled document');
  // The sample itself stays in the library.
  expect(state.docs.map((row) => row.name)).toContain(SAMPLE_NAME);

  const reader = await dbApi.openDatabase();
  expect(await dbApi.getMeta(reader, 'onboarding')).toEqual({
    sampleDocId: state.sampleDocId,
    dismissed: true,
  });
  reader.close();
});

it('dismisses without touching the sample document', async () => {
  render(<WelcomeStrip />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Dismiss sample notice' }),
  );

  expect(screen.queryByTestId('welcome-strip')).not.toBeInTheDocument();
  expect(useDocumentStore.getState().sampleDismissed).toBe(true);
  expect(useDocumentStore.getState().name).toBe(SAMPLE_NAME);
});

it('stays dismissed across a reload, even with the sample re-opened', async () => {
  render(<WelcomeStrip />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Dismiss sample notice' }),
  );
  cleanup();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();

  expect(useDocumentStore.getState().activeId).not.toBeNull();
  render(<WelcomeStrip />);
  expect(screen.queryByTestId('welcome-strip')).not.toBeInTheDocument();
});
