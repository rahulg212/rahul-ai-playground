'use client';

/**
 * localStorage-backed React state, implemented with useSyncExternalStore —
 * the React-endorsed pattern for subscribing to an external store.
 *
 * A module-level cache keeps getSnapshot identity-stable between writes
 * (required by useSyncExternalStore) and doubles as the "current" value for
 * functional updates. Writes go through the cache, then localStorage, then
 * notify this tab's subscribers. Cross-tab sync is handled via the native
 * "storage" event.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { loadJson, saveJson } from '@/lib/storage';

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, unknown>();
const hydratedKeys = new Set<string>();

/** Read (and lazily hydrate) the cached value for a key. */
function readKey<T>(key: string, loader: (() => T) | undefined, fallback: T): T {
  if (!hydratedKeys.has(key)) {
    let loaded: T;
    try {
      loaded = loader ? loader() : loadJson<T>(key, fallback);
    } catch {
      loaded = fallback;
    }
    cache.set(key, loaded);
    hydratedKeys.add(key);
  }
  return cache.get(key) as T;
}

/** Write the value to cache + localStorage and notify subscribers. */
function writeKey(key: string, value: unknown): void {
  cache.set(key, value);
  hydratedKeys.add(key);
  saveJson(key, value);
  listeners.get(key)?.forEach((listener) => listener());
}

// Keep multiple browser tabs in sync with each other.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const key = event.key;
    if (!key || !listeners.has(key)) return;
    cache.delete(key);
    hydratedKeys.delete(key);
    listeners.get(key)?.forEach((listener) => listener());
  });
}

export function useLocalStorage<T>(key: string, fallback: T, load?: () => T) {
  const subscribe = useCallback(
    (listener: Listener) => {
      const set = listeners.get(key) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );

  // Cached read — keeps the snapshot stable across renders.
  const getSnapshot = useCallback(() => readKey(key, load, fallback), [key, load, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Mirrors useState's setter, including functional updates. */
  const setValue = useCallback(
    (update: T | ((previous: T) => T)) => {
      const current = readKey(key, load, fallback);
      const next = typeof update === 'function' ? (update as (previous: T) => T)(current) : update;
      writeKey(key, next);
    },
    [key, load, fallback],
  );

  return { value, setValue } as const;
}
