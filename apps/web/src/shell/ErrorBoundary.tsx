import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorToMessage } from '../api/client';

interface ErrorBoundaryProps {
  /** What crashed — names the scope in the fallback ("the Orders section"). */
  label: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

/**
 * The page's containment line: a render error inside one section becomes that
 * section's inline failure — the same alert-and-retry shape the network error
 * states use — instead of React unmounting the whole page to a blank screen.
 * The key on each instance resets with the section's identity, and "Try
 * again" remounts the children so a transient render error recovers without
 * a reload.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(cause: unknown): ErrorBoundaryState {
    return { message: errorToMessage(cause) };
  }

  componentDidCatch(_cause: unknown, info: ErrorInfo): void {
    // The boundary's job is containment, not silence — keep the stack in the
    // console so a real bug stays diagnosable.
    console.error(`${this.props.label} failed to render:`, info.componentStack);
  }

  render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;
    return (
      <div
        role="alert"
        className="rounded-pane border border-hairline bg-surface p-4 sm:p-5"
      >
        <p className="text-xs text-danger">{message}</p>
        <button
          type="button"
          onClick={() => this.setState({ message: null })}
          className="touch-target mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Try again
        </button>
      </div>
    );
  }
}
