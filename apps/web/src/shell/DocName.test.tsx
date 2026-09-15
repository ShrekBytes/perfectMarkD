// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('compact variant', () => {
  it('shows the name as a readout and renames through the dialog', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<DocName name="My report" onRename={onRename} variant="dialog" />);

    // The bar holds the name (a readout, not a cramped edit field)…
    const trigger = screen.getByRole('button', {
      name: 'Rename document: My report',
    });
    expect(trigger).toHaveTextContent('My report');

    // …and rename happens in a dialog with a full-width field.
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Rename document' });
    const input = screen.getByRole('textbox', { name: 'Document name' });
    expect(input).toHaveValue('My report');

    await user.clear(input);
    await user.type(input, 'Quarterly report{Enter}');
    expect(onRename).toHaveBeenCalledWith('Quarterly report');
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('My report'); // prop not yet updated
  });

  it('closes without renaming on an empty draft, and cancels cleanly', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<DocName name="My report" onRename={onRename} variant="dialog" />);

    const trigger = () =>
      screen.getByRole('button', { name: 'Rename document: My report' });
    await user.click(trigger());
    const input = screen.getByRole('textbox', { name: 'Document name' });

    // An empty draft renames nothing; Enter still dismisses the dialog.
    await user.clear(input);
    await user.type(input, '   {Enter}');
    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Rename document' }),
    ).not.toBeInTheDocument();

    // Cancel abandons the draft.
    await user.click(trigger());
    await user.type(
      screen.getByRole('textbox', { name: 'Document name' }),
      ' v2',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Rename document' }),
    ).not.toBeInTheDocument();
  });
});
