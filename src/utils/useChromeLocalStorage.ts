import * as React from 'react';

interface UseChromeLocalStorageOptions<T> {
  debounceMs?: number;
  serialize?: (value: T) => unknown;
  deserialize?: (stored: unknown) => T;
}

const DEFAULT_DEBOUNCE = 250;

export function useChromeLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: UseChromeLocalStorageOptions<T>
): readonly [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const { debounceMs = DEFAULT_DEBOUNCE, serialize, deserialize } = options ?? {};
  const [value, setValue] = React.useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = React.useState<boolean>(false);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await chrome.storage.local.get(key);
        if (!active) return;
        const raw = stored?.[key as keyof typeof stored];
        if (raw !== undefined) {
          setValue(deserialize ? deserialize(raw) : (raw as T));
        } else {
          setValue(defaultValue);
        }
      } catch (error) {
        console.warn('Failed to read chrome.storage.local key', key, error);
        setValue(defaultValue);
      } finally {
        if (active) setIsHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [key, defaultValue, deserialize]);

  React.useEffect(() => {
    if (!isHydrated) return undefined;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      const payload = serialize ? serialize(value) : value;
      void chrome.storage.local.set({ [key]: payload }).catch((error: unknown) => {
        console.warn('Failed to write chrome.storage.local key', key, error);
      });
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, key, isHydrated, debounceMs, serialize]);

  React.useDebugValue({ key, value, isHydrated });

  return [value, setValue, isHydrated] as const;
}
