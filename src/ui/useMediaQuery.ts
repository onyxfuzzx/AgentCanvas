import { useSyncExternalStore } from 'react';

const compactQuery = '(max-width: 760px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const snapshot = () => window.matchMedia(compactQuery).matches;

export function useCompactLayout() {
  return useSyncExternalStore(subscribe, snapshot);
}
