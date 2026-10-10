import {useLayoutEffect,useRef} from 'react';

/** Ignore a completion after identity/branch/capability changes or unmount. */
export function useOperationScope(scopeKey: string | null) {
  const generation = useRef(0);
  const active = useRef(false);
  useLayoutEffect(() => {
    generation.current += 1;
    active.current = scopeKey !== null;
    return () => {active.current = false; generation.current += 1;};
  },[scopeKey]);
  return () => {
    const captured = generation.current;
    return () => active.current && generation.current === captured;
  };
}
