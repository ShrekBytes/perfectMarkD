// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import * as api from '../auth/api';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import { AiSection } from './AiSection';
import { UNCONFIGURED_AI, type AiAccountState } from '../ai/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetAccountStoreForTests();
});

function ai(overrides: Partial<AiAccountState> = {}): AiAccountState {
  return {
    ...UNCONFIGURED_AI,
    configured: true,
    included: true,
    allowance: 100,
    remaining: 93,
    period: '2026-09',
    resetsAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function seed(state: AiAccountState | null): void {
  useAccountStore.setState({ ai: state, status: 'ready' });
}

describe('when the instance has no provider configured', () => {
  it('renders nothing at all — no upsell for a feature the operator cannot serve', () => {
    seed(ai({ configured: false, included: false, remaining: 0 }));
    const { container } = render(<AiSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when signed out', () => {
    seed(null);
    const { container } = render(<AiSection />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('with an included plan', () => {
  it('shows the remaining AI Actions and the reset date beside the Quota', () => {
    seed(ai({ remaining: 93 }));
    render(<AiSection />);

    expect(
      screen.getByRole('heading', { name: 'AI Actions' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('account-ai-remaining')).toHaveTextContent(
      '93 of 100 left this month · resets 2026-10-01',
    );
  });

  it('turns AI Access off and stores the fresh state the server returns', async () => {
    const user = userEvent.setup();
    seed(ai());
    const off = ai({ access: false });
    const setAccess = vi.spyOn(api, 'setAiAccess').mockResolvedValue(off);
    render(<AiSection />);

    const toggle = screen.getByRole('checkbox', { name: 'AI Access' });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(setAccess).toHaveBeenCalledWith(false);
    await waitFor(() => expect(useAccountStore.getState().ai).toEqual(off));
    expect(
      screen.getByRole('checkbox', { name: 'AI Access' }),
    ).not.toBeChecked();
    expect(
      screen.getByText(/commands are hidden in the editor/),
    ).toBeInTheDocument();
  });

  it('reports a failed switch instead of pretending it worked', async () => {
    const user = userEvent.setup();
    seed(ai());
    vi.spyOn(api, 'setAiAccess').mockRejectedValue(
      new ApiError('Not signed in.', 401),
    );
    render(<AiSection />);

    await user.click(screen.getByRole('checkbox', { name: 'AI Access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not signed in.',
    );
    // The switch still reads what the server last confirmed.
    expect(screen.getByRole('checkbox', { name: 'AI Access' })).toBeChecked();
  });
});

describe('without an included plan', () => {
  it('names what the plans include and points at the plans', () => {
    seed(ai({ included: false, remaining: 0 }));
    render(<AiSection />);

    expect(
      screen.getByText(/AI Actions are part of Pro and Premium/),
    ).toBeInTheDocument();
    expect(screen.getByText(/external AI provider/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
