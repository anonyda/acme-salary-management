import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

// Returns [debouncedValue, setImmediately] — the setter lets a caller force
// the debounced value right away (e.g. a "clear" action), bypassing the
// pending timer instead of waiting out the delay for it to catch up.
export function useDebouncedValue<T>(value: T, delayMs: number): [T, Dispatch<SetStateAction<T>>] {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return [debounced, setDebounced];
}
