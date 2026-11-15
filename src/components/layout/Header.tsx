import { KeyRound, Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRuntime } from '../../hooks/useRuntime';
import { Badge, Dot } from '../common/ui';
import { healthLabel, healthTone } from './status';

export function Header({ title, onMenu, onKeys, children }: { title: string; onMenu: () => void; onKeys: () => void; children?: ReactNode }) {
  const rt = useRuntime();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg px-4">
      <button type="button" onClick={onMenu} className="rounded p-1.5 text-muted hover:text-text lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-[15px] font-semibold">{title}</h1>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {children}
        <span className="hidden sm:inline-flex">
          <Badge tone={healthTone(rt.health)}>
            <Dot tone={healthTone(rt.health)} />
            {healthLabel(rt.health)}
          </Badge>
        </span>
        <button
          type="button"
          onClick={onKeys}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          aria-label="API keys"
          title="API keys"
        >
          <KeyRound className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
