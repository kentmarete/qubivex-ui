import { useEffect, useState } from 'react';
import { setSecret, type SecretKind } from '../../services/auth';
import { Dialog } from '../common/Dialog';
import { SecretInput } from '../common/SecretInput';
import { Button } from '../common/ui';

const COPY: Record<SecretKind, { title: string; label: string; help: string }> = {
  api: {
    title: 'API key required',
    label: 'API key',
    help: 'This server requires an API key for /v1 requests (--api-key or a named client key). It is kept for this browser session only.',
  },
  admin: {
    title: 'Admin token required',
    label: 'Admin token',
    help: 'Loading, unloading and model management need the admin token (--admin-token). An API key does not grant admin access.',
  },
};

export function AuthDialog({ kind, onClose }: { kind: SecretKind | null; onClose: () => void }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [kind]);
  const c = COPY[kind ?? 'api'];
  return (
    <Dialog open={kind !== null} onClose={onClose} title={c.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!kind || !value.trim()) return;
          setSecret(kind, value);
          onClose();
        }}
        className="space-y-4"
      >
        <p className="text-[13px] text-muted">{c.help}</p>
        <div className="space-y-1.5">
          <label htmlFor="auth-secret" className="text-[13px]">
            {c.label}
          </label>
          <SecretInput id="auth-secret" value={value} onChange={setValue} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!value.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
