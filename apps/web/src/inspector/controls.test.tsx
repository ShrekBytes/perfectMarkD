// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
      <TextInput
        value='x'
        onChange={() => {}}
        ariaLabel='sample text'
      />
    ),
  },
  {
    name: 'number input',
    label: 'sample number',
    render: () => (
      <NumberInput value={1} onChange={() => {}} ariaLabel='sample number' />
    ),
  },
  {
    name: 'select',
    label: 'sample select',
    render: () => (
      <Select
        ariaLabel='sample select'
        value='a'
        options={[{ value: 'a', label: 'a' }]}
        onChange={() => {}}
      />
    ),
  },
  {
    name: 'color swatch',
    label: 'sample color',
    render: () => (
      <ColorInput value='#7c6af7' onChange={() => {}} ariaLabel='sample color' />
    ),
  },
];

describe('field surfaces', () => {
  it.each(cases)('renders the $name on the field token, not the paper token', (c) => {
    render(c.render());
    const control = screen.getByLabelText(c.label);
    expect(control.className).toContain('bg-field');
    expect(control.className).not.toContain('bg-page');
  });

  it('renders the locked upload stub on the field token', () => {
    render(<FauxUploadButton />);
    const stub = screen.getByTestId('faux-upload');
    expect(stub.className).toContain('bg-field');
    expect(stub.className).not.toContain('bg-page');
  });
});
