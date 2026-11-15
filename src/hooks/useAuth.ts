import { useSyncExternalStore } from 'react';
import { getSecret, remembers, snapshot, subscribe } from '../services/auth';

/** Whether each secret is set (never the secrets themselves, to keep them out of renders). */
export function useAuth() {
  useSyncExternalStore(subscribe, snapshot);
  return {
    hasApiKey: getSecret('api') !== null,
    hasAdminToken: getSecret('admin') !== null,
    remember: remembers(),
  };
}
