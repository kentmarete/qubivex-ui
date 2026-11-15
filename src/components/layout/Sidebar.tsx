import { Activity, Boxes, Cpu, MessageSquare, Settings, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { useRuntime } from '../../hooks/useRuntime';
import { PAGES, pathOf, type PageId } from '../../utils/routes';
import { Dot } from '../common/ui';
import { Logo } from './Logo';
import { accessLabel, healthLabel, healthTone } from './status';

const ICONS: Record<PageId, ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  metrics: Activity,
  models: Boxes,
  system: Cpu,
  settings: Settings,
};

export function Sidebar({ page, onNavigate, open, onClose }: { page: PageId; onNavigate: (p: PageId) => void; open: boolean; onClose: () => void }) {
  const rt = useRuntime();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <Logo />
          <span className="font-semibold tracking-tight">Qubivex</span>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted" title={healthLabel(rt.health)}>
            <Dot tone={healthTone(rt.health)} />
            <span className="sr-only">{healthLabel(rt.health)}</span>
          </span>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:text-text lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {PAGES.map((p) => {
            const Icon = ICONS[p.id];
            const active = p.id === page;
            return (
              <a
                key={p.id}
                href={pathOf(p.id)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onNavigate(p.id);
                  onClose();
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-md px-3 transition-colors ${
                  active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4" />
                {p.title}
              </a>
            );
          })}
        </nav>
        <dl className="space-y-1.5 border-t border-border p-4 text-[12px]">
          <div className="flex items-center gap-2">
            <Dot tone={rt.health === 'down' ? 'danger' : rt.access === 'required' ? 'warn' : rt.health === 'checking' ? 'muted' : 'ok'} />
            <dt className="sr-only">API</dt>
            <dd>{accessLabel(rt.access, rt.health)}</dd>
          </div>
          <div className="flex justify-between gap-2 text-muted">
            <dt>Version</dt>
            <dd className="font-mono" title={rt.system?.version ? undefined : 'This server does not report its version'}>
              {rt.system?.version ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 text-muted">
            <dt>Model</dt>
            <dd className="truncate font-mono text-text/90">{rt.selectedModel ?? '—'}</dd>
          </div>
        </dl>
      </aside>
    </>
  );
}
