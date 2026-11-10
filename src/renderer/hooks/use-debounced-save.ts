import { useDebounce } from "@uidotdev/usehooks";
import { useEffect, useRef } from "react";

/**
 * Saves `value` once it settles and differs from `saved`. An edit still inside the delay is saved
 * on unmount, so leaving the page right after typing (Escape, a sidebar link) keeps it.
 */
export function useDebouncedSave<T>(
  value: T,
  saved: T,
  save: (value: T) => void,
  delay = 500,
) {
  const debounced = useDebounce(value, delay);
  const latest = useRef({ value, debounced, saved, save });

  useEffect(() => {
    latest.current = { value, debounced, saved, save };
  });

  useEffect(() => {
    if (debounced !== saved) save(debounced);
  }, [debounced]);

  useEffect(
    () => () => {
      const { value, debounced, saved, save } = latest.current;
      if (value !== debounced && value !== saved) save(value);
    },
    [],
  );
}
