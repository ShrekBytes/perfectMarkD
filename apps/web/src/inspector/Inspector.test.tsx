// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import { Inspector } from './Inspector';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import * as api from '../auth/api';
import type { MePayload } from '../auth/api';
import { LOCKED_FLAGS, OPEN_FLAGS } from '../auth/flags';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';

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

/** A free signed-in /api/me payload — used by the re-lock tests. */
function mePayload(overrides: Partial<MePayload> = {}): MePayload {
  return {
    email: 'a@b.co',
    isAdmin: false,
    plan: null,
    expiresAt: null,
    quota: { used: 0, limit: 0 },
    flags: LOCKED_FLAGS,
    ...overrides,
  };
}

const activeSettings = () => useDocumentStore.getState().settings;

/** Switches to a blank document so default-value assertions see DEFAULT_SETTINGS,
 *  not the seeded sample's furniture (frame + footer text). */
async function openBlankDocument(): Promise<void> {
  await act(async () => {
    await useDocumentStore.getState().startBlankDocument();
  });
}

/** Option labels of a select, in order. */
function optionLabels(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map(
    (option) => option.textContent ?? '',
  );
}

describe('Inspector tabs', () => {
  it('renders the three tabs and swaps panels', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    expect(
      screen.getByRole('tab', { name: 'Page', selected: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tabpanel', { name: 'Page settings' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Style' }));
    expect(
      screen.getByRole('tabpanel', { name: 'Style settings' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tabpanel', { name: 'Page settings' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));
    expect(
      screen.getByRole('tabpanel', { name: 'Header-Footer settings' }),
    ).toBeInTheDocument();
  });

  it('shows the empty state when no document is open', () => {
    act(() => {
      useDocumentStore.setState({ status: 'ready', activeId: null });
    });
    render(<Inspector />);
    expect(
      screen.getByText('Page, style, and header/footer settings live here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('Page tab', () => {
  it('edits margins through the store', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    const top = screen.getByRole('spinbutton', { name: 'Top margin' });
    await user.clear(top);
    await user.type(top, '42');
    expect(activeSettings().marginTop).toBe(42);
  });

  it('retains typing drafts: clearing a value before typing a new one', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    // Clear "20" then type "15" — a naive controlled input would report
    // 2, 25, 201, … as the store value snaps back mid-edit.
    const top = screen.getByRole('spinbutton', { name: 'Top margin' });
    await user.clear(top);
    await user.type(top, '15');
    expect(activeSettings().marginTop).toBe(15);
  });

  it('clamps negative entries to zero', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    const left = screen.getByRole('spinbutton', { name: 'Left margin' });
    await user.clear(left);
    await user.type(left, '-8');
    expect(activeSettings().marginLeft).toBe(0);
  });

  it('switches orientation', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Orientation' }),
      'landscape',
    );
    expect(activeSettings().orientation).toBe('landscape');
  });

  it('toggles the frame and edits its style (blank document)', async () => {
    await openBlankDocument();
    const user = userEvent.setup();
    render(<Inspector />);

    expect(
      screen.getByRole('combobox', { name: 'Frame style' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Page frame' }));
    expect(activeSettings().frameEnabled).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Frame style' })).toBeEnabled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Frame style' }),
      'dashed',
    );
    expect(activeSettings().frameStyle).toBe('dashed');
  });

  it('changes the page size among the free named sizes', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Page size' }),
      'A5',
    );
    expect(activeSettings().pageSize).toBe('A5');
  });

  it('locks Custom page size, custom size inputs, and the background image', async () => {
    render(<Inspector />);

    expect(screen.getByRole('option', { name: 'Custom…' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Background image (paid feature)' }),
    ).toBeInTheDocument();
    // Fit/scope/opacity ride on the same gate: visible, bound, disabled.
    expect(
      screen.getByRole('combobox', { name: 'Background image fit' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: 'Background image scope' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('spinbutton', { name: 'Background image opacity' }),
    ).toBeDisabled();
    expect(screen.getByTestId('faux-upload')).toBeInTheDocument();
  });
});

describe('Style tab', () => {
  it('renders one radio per preset with thumbnails, the active one selected', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

    const gallery = screen.getByRole('radiogroup', { name: 'Style preset' });
    expect(gallery.querySelectorAll('[role="radio"]')).toHaveLength(7);
    // The seeded sample runs the default preset.
    expect(screen.getByRole('radio', { name: /default/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // The thumb is a CSS sketch, not an engine run: no page hosts mount.
    expect(document.querySelectorAll('.pm-page-host')).toHaveLength(0);
  });

  it('switching presets adopts the style and updates selection', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Style' }));

    await user.click(screen.getByRole('radio', { name: /newspaper/i }));
    expect(activeSettings().preset).toBe('newspaper');
    expect(activeSettings().fontFamily).toBe('Georgia, serif');
    expect(activeSettings().centerH1).toBe(true);
    expect(screen.getByRole('radio', { name: /newspaper/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /default/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('edits typography', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Style' }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Body font' }),
      'Arial, sans-serif',
    );
    expect(activeSettings().fontFamily).toBe('Arial, sans-serif');

    const size = screen.getByRole('spinbutton', { name: 'Body font size' });
    await user.clear(size);
    await user.type(size, '15');
    expect(activeSettings().fontSize).toBe(15);
  });

  it('edits colors through the native picker', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

    const accent = screen.getByLabelText('Accent color');
    fireEvent.input(accent, { target: { value: '#e84393' } });
    expect(activeSettings().accentColor).toBe('#e84393');
  });

  it('lists the Shiki catalog in the code theme dropdown', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

    const select = screen.getByRole('combobox', { name: 'Code theme' });
    const labels = optionLabels(select);
    expect(labels).toContain('None (plain code)');
    expect(labels).toContain('github-dark');
    expect(labels).toContain('dracula');
    // The full catalog, not a curated shortlist.
    expect(labels.length).toBeGreaterThan(50);

    await userEvent.setup().selectOptions(select, 'dracula');
    expect(activeSettings().codeTheme).toBe('dracula');
  });

  it('toggles code ligatures', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Style' }));

    await user.click(screen.getByRole('checkbox', { name: 'Font ligatures' }));
    expect(activeSettings().codeFontLigatures).toBe(true);
  });

  it('changes the code font', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

    await userEvent
      .setup()
      .selectOptions(
        screen.getByRole('combobox', { name: 'Code font' }),
        'Consolas, monospace',
      );
    expect(activeSettings().codeFontFamily).toBe('Consolas, monospace');
  });

  it('locks custom fonts and the custom stylesheet', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));

    expect(
      screen.getByRole('button', { name: 'Custom fonts (paid feature)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Custom stylesheet (paid feature)',
      }),
    ).toBeInTheDocument();
  });
});

describe('Header-Footer tab', () => {
  it('edits header and footer text', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    await user.type(
      screen.getByRole('textbox', { name: 'Header text' }),
      'Quarterly report',
    );
    expect(activeSettings().headerText).toBe('Quarterly report');

    const footer = screen.getByRole('textbox', { name: 'Footer text' });
    await user.clear(footer);
    await user.type(footer, 'Acme Inc');
    expect(activeSettings().footerText).toBe('Acme Inc');
  });

  it('suppresses the header on the first page', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    await user.click(
      screen.getByRole('checkbox', { name: 'Show header on first page' }),
    );
    expect(activeSettings().showHeaderOnFirstPage).toBe(false);
    // Footer's own toggle stays on.
    expect(
      screen.getByRole('checkbox', { name: 'Show footer on first page' }),
    ).toBeChecked();
  });

  it("disables a band's fields when the band is switched off", async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    await user.click(screen.getByRole('checkbox', { name: 'Show header' }));
    expect(screen.getByRole('textbox', { name: 'Header text' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Show header on first page' }),
    ).toBeDisabled();
    // The footer band stays editable.
    expect(screen.getByRole('textbox', { name: 'Footer text' })).toBeEnabled();
  });

  it('edits the page-number format template with placeholders', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    const format = screen.getByRole('textbox', { name: 'Page number format' });
    await userEvent.setup().clear(format);
    // fireEvent: userEvent.type would read the {{…}} as key syntax.
    fireEvent.input(format, {
      target: { value: 'Page {{current}} of {{total}}' },
    });
    expect(activeSettings().pageNumberFormat).toBe(
      'Page {{current}} of {{total}}',
    );
  });

  it('sets page-number position and start', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Page number position' }),
      'center',
    );
    expect(activeSettings().pageNumberPosition).toBe('center');

    const start = screen.getByRole('spinbutton', { name: 'Page number start' });
    await user.clear(start);
    await user.type(start, '3');
    expect(activeSettings().pageNumberStart).toBe(3);
  });

  it('locks the banner images in both bands', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));
    expect(
      screen.getAllByRole('button', { name: 'Banner image (paid feature)' }),
    ).toHaveLength(2);
  });

  it('edits header/footer font sizes and colors', async () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    const size = screen.getByRole('spinbutton', { name: 'Header font size' });
    const user = userEvent.setup();
    await user.clear(size);
    await user.type(size, '11');
    expect(activeSettings().headerFontSize).toBe(11);

    fireEvent.input(screen.getByLabelText('Footer font color'), {
      target: { value: '#333333' },
    });
    expect(activeSettings().footerFontColor).toBe('#333333');
  });
});

describe('locked gates open the pricing modal', () => {
  it('shows the modal from any lock, closable, from any tab', async () => {
    const user = userEvent.setup();
    render(<Inspector />);

    await user.click(
      screen.getByRole('button', { name: 'Background image (paid feature)' }),
    );
    await screen.findByRole('dialog', { name: /plans and pricing/i });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /plans and pricing/i }),
      ).not.toBeInTheDocument();
    });

    // Works again from the Header/Footer banner lock.
    await user.click(screen.getByRole('tab', { name: 'Header/Footer' }));
    await user.click(
      screen.getAllByRole('button', {
        name: 'Banner image (paid feature)',
      })[0]!,
    );
    await screen.findByRole('dialog', { name: /plans and pricing/i });
  });
});

describe('persistence through the store', () => {
  it('persists settings edits per document (autosave round-trip)', async () => {
    render(<Inspector />);

    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    await userEvent
      .setup()
      .click(screen.getByRole('radio', { name: /newspaper/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    const top = screen.getByRole('spinbutton', { name: 'Top margin' });
    await userEvent.setup().clear(top);
    await userEvent.setup().type(top, '33');

    await act(async () => {
      await useDocumentStore.getState().flush();
    });
    const { activeId, settings } = useDocumentStore.getState();

    const { openDatabase } = await import('../documents/db');
    const reader = await openDatabase();
    const saved = await reader.get('documents', activeId!);
    reader.close();
    expect(saved?.settings.preset).toBe('newspaper');
    expect(saved?.settings.marginTop).toBe(33);
    expect(saved?.settings).toEqual(settings);
  });
});

describe('updateActive gating', () => {
  it('leaves settings untouched with no active document', () => {
    act(() => {
      useDocumentStore.setState({ activeId: null });
    });
    render(<Inspector />);
    const before = useDocumentStore.getState().settings;
    expect(before).toEqual(before); // mounts the empty state, no edits possible
    expect(
      screen.queryByRole('spinbutton', { name: 'Top margin' }),
    ).not.toBeInTheDocument();
    expect(useDocumentStore.getState().settings).toBe(before);
  });
});

describe('canvas re-render on settings change', () => {
  it('settings edits replace the settings object the canvas subscribes to', async () => {
    render(<Inspector />);
    const before = activeSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    await userEvent
      .setup()
      .click(screen.getByRole('radio', { name: /minimal/i }));
    const after = activeSettings();
    expect(after).not.toBe(before); // new object identity = canvas re-render
    expect(after.preset).toBe('minimal');
    void DEFAULT_SETTINGS; // shape reference
  });
});

describe('unlocked gates (billing/04)', () => {
  afterEach(() => {
    resetAccountStoreForTests();
  });

  /** Seeds a signed-in Pro account — the flags /api/me reported. */
  function unlockAsPro(): void {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: { plan: 'pro', expiresAt: '2026-10-01T00:00:00.000Z' },
      quota: { used: 3, limit: 300 },
      flags: OPEN_FLAGS,
      status: 'ready',
    });
  }

  /** The hidden file input a GateImagePicker's button drives. */
  function fileInputBehind(button: HTMLElement): HTMLInputElement {
    const input =
      button.parentElement?.parentElement?.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('no file input behind picker');
    }
    return input;
  }

  it('no locks remain while the flags are open', async () => {
    unlockAsPro();
    render(<Inspector />);

    expect(
      screen.queryByRole('button', { name: /paid feature/i }),
    ).not.toBeInTheDocument();

    // Style tab: fonts and stylesheet are included, not locked.
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.getAllByTestId('gate-included')).toHaveLength(2);
    expect(screen.queryByTestId('faux-upload')).not.toBeInTheDocument();

    // Page tab: Custom… is selectable.
    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    expect(screen.getByRole('option', { name: 'Custom…' })).toBeEnabled();

    // Header/Footer tab: one live picker per band.
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));
    expect(
      screen.getByRole('button', { name: 'Header banner image' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Footer banner image' }),
    ).toBeInTheDocument();
  });

  it('unlocks the custom page size and edits it end to end', async () => {
    unlockAsPro();
    const user = userEvent.setup();
    render(<Inspector />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Page size' }),
      'Custom',
    );
    expect(activeSettings().pageSize).toBe('Custom');

    const width = screen.getByRole('spinbutton', { name: 'Custom width' });
    const height = screen.getByRole('spinbutton', { name: 'Custom height' });
    expect(width).toBeEnabled();
    expect(height).toBeEnabled();
    await user.clear(width);
    await user.type(width, '148');
    await user.clear(height);
    await user.type(height, '210');
    expect(activeSettings().customPageWidth).toBe(148);
    expect(activeSettings().customPageHeight).toBe(210);
  });

  it('the unlocked background image uploads through the asset store', async () => {
    unlockAsPro();
    const user = userEvent.setup();
    const addAsset = vi
      .fn()
      .mockResolvedValue({ ok: true, ref: 'asset://bg1', alt: 'bg' });
    act(() => {
      useDocumentStore.setState({ addAsset });
    });
    render(<Inspector />);

    const picker = screen.getByRole('button', { name: 'Background image' });
    expect(picker).toHaveTextContent('Upload…');
    const input = fileInputBehind(picker);
    const file = new File(['x'], 'bg.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(addAsset).toHaveBeenCalledWith(file);
    expect(activeSettings().backgroundImageRef).toBe('asset://bg1');
    // The engine only paints the layer when enabled — uploading turns it on.
    expect(activeSettings().backgroundImageEnabled).toBe(true);

    // A set image can be replaced or removed.
    expect(picker).toHaveTextContent('Replace…');
    await user.click(
      screen.getByRole('button', { name: 'Remove Background image' }),
    );
    expect(activeSettings().backgroundImageRef).toBe('');
    expect(activeSettings().backgroundImageEnabled).toBe(false);
  });

  it('background sub-controls go live with the gate', async () => {
    unlockAsPro();
    const user = userEvent.setup();
    render(<Inspector />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Background image fit' }),
      'tile',
    );
    expect(activeSettings().backgroundImageSize).toBe('tile');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Background image scope' }),
      'content-only',
    );
    expect(activeSettings().backgroundImageScope).toBe('content-only');

    const opacity = screen.getByRole('spinbutton', {
      name: 'Background image opacity',
    });
    await user.clear(opacity);
    await user.type(opacity, '40');
    expect(activeSettings().backgroundImageOpacity).toBe(0.4);
  });

  it('surfaces an ingest failure inline instead of writing a broken ref', async () => {
    unlockAsPro();
    const addAsset = vi
      .fn()
      .mockResolvedValue({ ok: false as const, error: 'too-large' as const });
    act(() => {
      useDocumentStore.setState({ addAsset });
    });
    render(<Inspector />);

    const input = fileInputBehind(
      screen.getByRole('button', { name: 'Background image' }),
    );
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'huge.png', { type: 'image/png' })] },
      });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /over the 20 MB limit/i,
    );
    expect(activeSettings().backgroundImageRef).toBe('');
  });

  it('banner uploads set the band refs', async () => {
    unlockAsPro();
    render(<Inspector />);
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));

    const addAsset = vi.fn().mockImplementation(async (file: File) => ({
      ok: true as const,
      ref: `asset://${file.name}`,
      alt: file.name,
    }));
    act(() => {
      useDocumentStore.setState({ addAsset });
    });

    // The header picker is the first picker in the tab's DOM order.
    const headerPicker = screen.getByRole('button', {
      name: 'Header banner image',
    });
    await act(async () => {
      fireEvent.change(fileInputBehind(headerPicker), {
        target: {
          files: [new File(['x'], 'header.png', { type: 'image/png' })],
        },
      });
    });
    expect(activeSettings().headerImageRef).toBe('asset://header.png');
    expect(activeSettings().footerImageRef).toBe('');

    const footerPicker = screen.getByRole('button', {
      name: 'Footer banner image',
    });
    await act(async () => {
      fireEvent.change(fileInputBehind(footerPicker), {
        target: {
          files: [new File(['x'], 'footer.png', { type: 'image/png' })],
        },
      });
    });
    expect(activeSettings().footerImageRef).toBe('asset://footer.png');
    // Removing clears the ref without touching the other band.
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Remove Header banner image' }),
      );
    expect(activeSettings().headerImageRef).toBe('');
    expect(activeSettings().footerImageRef).toBe('asset://footer.png');
  });

  it('expiry re-locks the gates gracefully and keeps the settings', async () => {
    unlockAsPro();
    // A gated setting the user set while the plan was active.
    act(() => {
      useDocumentStore
        .getState()
        .updateActive({ settings: { headerImageRef: 'asset://banner' } });
    });
    render(<Inspector />);
    expect(
      screen.queryByRole('button', { name: /paid feature/i }),
    ).not.toBeInTheDocument();

    // The next /api/me reports the Entitlement gone (expiry or revoke).
    vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({ quota: { used: 3, limit: 0 } }),
    );
    await act(async () => {
      await useAccountStore.getState().refresh();
    });

    // The locks are back…
    fireEvent.click(screen.getByRole('tab', { name: 'Header/Footer' }));
    expect(
      screen.getAllByRole('button', { name: 'Banner image (paid feature)' }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    expect(screen.getByRole('option', { name: 'Custom…' })).toBeDisabled();
    // …no data was lost — the setting persists, just gated again…
    expect(useDocumentStore.getState().settings.headerImageRef).toBe(
      'asset://banner',
    );
    // …and the shell gets its clear notice.
    expect(useAccountStore.getState().planEndedNotice).toBe(true);
  });
});
