import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

/** Re-renders when the Dexie query's result changes. */
export const useLive = <T,>(query: () => Promise<T>, deps: unknown[], initial: T): T => {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
};
