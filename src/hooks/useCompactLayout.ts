import { useEffect, useState } from 'react';

const COMPACT_BREAKPOINT = 1024;

// For multi-pane layouts (e.g. the email inbox) that need a wider cutoff than
// the global 768px mobile breakpoint — three fixed-width columns don't fit in
// a 768-1023px tablet viewport, so tablet needs the same single-active-pane
// behavior as mobile, just with the collapsed pane showing more content.
export function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const onChange = () => setIsCompact(window.innerWidth < COMPACT_BREAKPOINT);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isCompact;
}
