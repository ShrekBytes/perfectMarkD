// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DocName } from './DocName';

afterEach(() => cleanup());

it('renders the document name as a single inline-edit field', () => {
  render(<DocName name="My report" onRename={vi.fn()} />);
  const input = screen.getByRole('textbox', { name: 'Document name' });
  expect(input).toHaveValue('My report');
});

it('commits a rename on Enter', async () => {
  const onRename = vi.fn();
  render(<DocName name="My report" onRename={onRename} />);
  const input = screen.getByRole('textbox', { name: 'Document name' });
  await userEvent.click(input);
  await userEvent.type(input, ' v2{Enter}');
  expect(onRename).toHaveBeenCalledWith('My report v2');
  expect(input).toHaveValue('My report v2');
});

it('commits a rename on blur', async () => {
  const onRename = vi.fn();
  const { container } = render(
    <DocName name="My report" onRename={onRename} />,
  );
  const input = screen.getByRole('textbox', { name: 'Document name' });
  await userEvent.type(input, ' — final');
  await userEvent.tab(); // move focus away → blur
  expect(onRename).toHaveBeenCalledWith('My report — final');
  expect(container).toBeDefined();
});

it('reverts the draft on Escape without renaming', async () => {
  const onRename = vi.fn();
  render(<DocName name="My report" onRename={onRename} />);
  const input = screen.getByRole('textbox', { name: 'Document name' });
  await userEvent.click(input);
  await userEvent.type(input, ' oops{Escape}');
  expect(onRename).not.toHaveBeenCalled();
  expect(input).toHaveValue('My report');
});

it('ignores renames that are empty or unchanged', async () => {
  const onRename = vi.fn();
  render(<DocName name="My report" onRename={onRename} />);
  const input = screen.getByRole('textbox', { name: 'Document name' });

  await userEvent.click(input);
  await userEvent.clear(input);
  await userEvent.type(input, '   {Enter}');
  expect(onRename).not.toHaveBeenCalled();

  await userEvent.type(input, '{Enter}');
  expect(onRename).not.toHaveBeenCalled();
});
