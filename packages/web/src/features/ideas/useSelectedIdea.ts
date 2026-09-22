import { useCallback, useEffect, useState } from 'react';
import type { Maybe } from '../../lib/types';

const PARAM = 'idea';

function readSelected(): Maybe<string> {
  return new URLSearchParams(window.location.search).get(PARAM);
}

// The open note lives in `?idea=<id>`, so the links Slack capture replies with open it directly.
export function useSelectedIdea(): [Maybe<string>, (id: Maybe<string>) => void] {
  const [selected, setSelectedState] = useState<Maybe<string>>(readSelected);

  useEffect(() => {
    const onPopState = () => setSelectedState(readSelected());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setSelected = useCallback((id: Maybe<string>) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(PARAM, id);
    else url.searchParams.delete(PARAM);
    window.history.pushState(null, '', url);
    setSelectedState(id);
  }, []);

  return [selected, setSelected];
}
