import { useEffect } from 'react';

// Re-runs `refresh` every `intervalMs` while `active`, e.g. while research is in flight.
export function usePolling(active: boolean, refresh: () => void, intervalMs = 5_000): void {
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, refresh, intervalMs]);
}
