// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PaneSwitcher } from './PaneSwitcher';

afterEach(() => cleanup());

it('marks the visible view and reports the chosen one', async () => {
  const onChange = vi.fn();
  render(<PaneSwitcher value="editor" onChange={onChange} />);

  expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Inspector' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Inspector' }));
  expect(onChange).toHaveBeenCalledWith('inspector');
});

it('names every view in text, so no view is icon-only', () => {
  render(<PaneSwitcher value="canvas" onChange={() => {}} />);

  const group = screen.getByRole('group', { name: 'Workspace view' });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});