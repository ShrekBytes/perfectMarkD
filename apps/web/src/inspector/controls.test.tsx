// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ColorInput,
  FauxUploadButton,
  NumberInput,
  Select,
  TextInput,
} from './controls';

afterEach(() => {
  cleanup();
});

/**
 * Field surfaces must use the --field token, never --page. --page is pinned to
 * #ffffff in both themes (it represents the exported sheet), while text follows
 * --ink, which flips to a light value in dark mode — so bg-page + text-ink is
 * light text on white and unreadable there. See DESIGN.md, Inputs / Fields.
 */
type ControlCase = {
  name: string;
  label: string;
  render: () => React.ReactElement;
};

const cases: ControlCase[] = [
  {
    name: 'text input',
    label: 'sample text',
    render: () => (
      <TextInput value="x" onChange={() => {}} ariaLabel="sample text" />
    ),
  },
  {
    name: 'number input',
    label: 'sample number',
    render: () => (
      <NumberInput value={1} onChange={() => {}} ariaLabel="sample number" />
    ),
  },
  {
    name: 'select',
    label: 'sample select',
    render: () => (
      <Select
        ariaLabel="sample select"
        value="a"
        options={[{ value: 'a', label: 'a' }]}
        onChange={() => {}}
      />
    ),
  },
  {
    name: 'color swatch',
    label: 'sample color',
    render: () => (
      <ColorInput
        value="#7c6af7"
        onChange={() => {}}
        ariaLabel="sample color"
      />
    ),
  },
];

describe('field surfaces', () => {
  it.each(cases)(
    'renders the $name on the field token, not the paper token',
    (c) => {
      render(c.render());
      const control = screen.getByLabelText(c.label);
      expect(control.className).toContain('bg-field');
      expect(control.className).not.toContain('bg-page');
    },
  );

  it('renders the locked upload stub on the field token', () => {
    render(<FauxUploadButton />);
    const stub = screen.getByTestId('faux-upload');
    expect(stub.className).toContain('bg-field');
    expect(stub.className).not.toContain('bg-page');
  });
});

describe('NumberInput settled display', () => {
  const input = (label: string) =>
    screen.getByLabelText(label) as HTMLInputElement;

  it('renders a float-noise value clean, at noise-free precision', () => {
    // Engine presets carry float drift (0.6499999…); the readout must not.
    render(
      <NumberInput
        value={0.6499999761581421}
        step={0.05}
        onChange={() => {}}
        ariaLabel="paragraph spacing"
      />,
    );
    expect(input('paragraph spacing').value).toBe('0.65');
  });

  it('keeps whole numbers free of decimal padding', () => {
    render(
      <NumberInput
        value={25.000000000001}
        onChange={() => {}}
        ariaLabel="margin"
      />,
    );
    expect(input('margin').value).toBe('25');
  });

  it('shows a typed fraction exactly, even in an integer-step field', () => {
    // Rounding is noise-removal, not step enforcement: 16.5 in an mm field
    // must keep its true value on screen after blur, not snap to 17.
    render(<NumberInput value={16.5} onChange={() => {}} ariaLabel="margin" />);
    expect(input('margin').value).toBe('16.5');
  });

  it('shows the settled value again after the draft drops on blur', () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={1.850000023841858}
        step={0.05}
        onChange={onChange}
        ariaLabel="line height"
      />,
    );
    const field = input('line height');
    expect(field.value).toBe('1.85');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '1.9' } });
    expect(onChange).toHaveBeenLastCalledWith(1.9);
    // The draft is dropped; the store's value renders at step precision.
    fireEvent.blur(field);
    expect(field.value).toBe('1.85');
  });
});
