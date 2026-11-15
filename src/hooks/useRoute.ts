import { useCallback, useEffect, useState } from 'react';
import { pageFromPath, pathOf, type PageId } from '../utils/routes';

/** Lightweight navigation: the page is the path under /ui, kept in sync with history. */
export function useRoute(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => pageFromPath(window.location.pathname) ?? 'chat');

  useEffect(() => {
    // /ui, /ui/ and unknown pages land on Chat.
    if (pageFromPath(window.location.pathname) === null) {
      window.history.replaceState(null, '', pathOf('chat'));
    }
    const onPop = () => setPage(pageFromPath(window.location.pathname) ?? 'chat');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((p: PageId) => {
    if (pathOf(p) !== window.location.pathname) window.history.pushState(null, '', pathOf(p));
    setPage(p);
  }, []);

  return [page, navigate];
}
