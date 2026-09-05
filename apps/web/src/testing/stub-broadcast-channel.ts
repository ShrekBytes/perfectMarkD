import { vi } from 'vitest';

type Listener = ((event: MessageEvent) => void) | null;

/**
 * BroadcastChannel stand-in for tests: instances on the same channel name
 * receive each other's messages (structured-cloned, like real cross-tab
 * delivery). Registry is static, so all store instances in a test file
 * connect; call `reset()` between tests.
 */
export class FakeBroadcastChannel {
  private static channels = new Map<string, FakeBroadcastChannel[]>();

  name: string;
  onmessage: Listener = null;

  constructor(name: string) {
    this.name = name;
    const peers = FakeBroadcastChannel.channels.get(name) ?? [];
    peers.push(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(message: unknown): void {
    const peers = FakeBroadcastChannel.channels.get(this.name) ?? [];
    for (const peer of peers) {
      if (peer === this) continue;
      peer.onmessage?.(
        new MessageEvent('message', { data: structuredClone(message) }),
      );
    }
  }

  close(): void {
    const peers = FakeBroadcastChannel.channels.get(this.name) ?? [];
    FakeBroadcastChannel.channels.set(
      this.name,
      peers.filter((peer) => peer !== this),
    );
  }

  static reset(): void {
    FakeBroadcastChannel.channels.clear();
  }

  /** All live instances on a channel, in creation order. */
  static peers(name: string): FakeBroadcastChannel[] {
    return FakeBroadcastChannel.channels.get(name) ?? [];
  }
}

/** Stubs the global BroadcastChannel with the fake; returns the class for
 *  reaching the instances a store created. */
export function stubBroadcastChannel(): typeof FakeBroadcastChannel {
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  return FakeBroadcastChannel;
}
