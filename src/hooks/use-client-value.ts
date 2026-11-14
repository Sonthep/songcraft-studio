"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Read a browser-only value without a setState-in-effect round trip.
 * Renders `serverValue` during SSR/hydration, then the client value.
 * `read` must return a stable (cached) value between calls.
 */
export function useClientValue<T>(read: () => T, serverValue: T, subscribe: (cb: () => void) => () => void = noopSubscribe): T {
  return useSyncExternalStore(subscribe, read, () => serverValue);
}
