import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus and layer plumbing for the shell's overlay surfaces (the Library
 * drawer, dialogs, and dropdown menus): Escape resolves the topmost open
 * layer only, modal surfaces trap Tab and restore focus to their trigger on
 * close, and menus rove with the arrow keys. One implementation so the
 * overlay layer can never drift apart.
 */

interface EscapeLayer {
  close: () => void;
}

/** Currently open layers, outermost first. */
const escapeLayers: EscapeLayer[] = [];

/**
 * Registers an open layer (drawer, dialog, or menu) so Escape closes only
 * the topmost one: with a dialog open over the Library, the first Escape
 * closes the dialog and the second closes the Library. `active` mirrors the
 * layer's open state, so components register while mounted/open and
 * unregister automatically.
 */
export function useEscapeLayer(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active) return;
    const layer: EscapeLayer = { close: () => closeRef.current() };
    escapeLayers.push(layer);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Every open layer hears the key; only the topmost acts.
      if (escapeLayers[escapeLayers.length - 1] !== layer) return;
      event.preventDefault();
      layer.close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = escapeLayers.indexOf(layer);
      if (index !== -1) escapeLayers.splice(index, 1);
    };
  }, [active]);
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal focus for drawer/dialog surfaces: remembers the trigger, moves focus
 * into the surface on open (a child's autoFocus wins if it already fired),
 * wraps Tab at the surface's edges while open, and restores focus to the
 * trigger on close. The surface needs an accessible name — focus lands on it
 * and screen readers announce it.
 */
export function useModalFocus(
  surfaceRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!active || !surface) return;

    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!surface.contains(document.activeElement)) {
      surface.focus();
    }

    const wrapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = Array.from(
        surface.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const current = document.activeElement;
      const backwards = event.shiftKey;
      if (current === surface) {
        event.preventDefault();
        (backwards ? last : first).focus();
      } else if (current === (backwards ? first : last)) {
        event.preventDefault();
        (backwards ? last : first).focus();
      } else if (!surface.contains(current)) {
        // Focus escaped the surface (e.g. programmatically): pull it back.
        event.preventDefault();
        (backwards ? last : first).focus();
      }
    };
    document.addEventListener('keydown', wrapTab, true);

    return () => {
      document.removeEventListener('keydown', wrapTab, true);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [active, surfaceRef]);
}

const MENU_ITEM = '[role="menuitem"]';

/**
 * Menu keyboard support (the ARIA menu-button pattern): opening places focus
 * on the first item, ArrowUp/Down/Home/End rove among the items, and Tab
 * closes the menu so focus resumes in the natural page order instead of
 * stranding an open menu behind the caret.
 */
export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    // Focus the first item once the menu is in the DOM.
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      if (event.key === 'Tab') {
        onCloseRef.current();
        return;
      }
      const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM));
      if (items.length === 0) return;
      const currentIndex = items.indexOf(
        document.activeElement as HTMLElement,
      );
      let next: HTMLElement;
      switch (event.key) {
        case 'ArrowDown':
          next =
            currentIndex === -1
              ? items[0]!
              : items[(currentIndex + 1) % items.length]!;
          break;
        case 'ArrowUp':
          next =
            currentIndex === -1
              ? items[items.length - 1]!
              : items[(currentIndex - 1 + items.length) % items.length]!;
          break;
        case 'Home':
          next = items[0]!;
          break;
        case 'End':
          next = items[items.length - 1]!;
          break;
        default:
          return;
      }
      event.preventDefault();
      next.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [active, menuRef]);
}
