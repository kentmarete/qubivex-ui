import { useEffect, useState } from 'react';
import { AuthDialog } from './components/layout/AuthDialog';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ModelSelect } from './components/chat/ModelSelect';
import { useRoute } from './hooks/useRoute';
import { RuntimeProvider } from './hooks/useRuntime';
import { ChatPage } from './pages/ChatPage';
import { MetricsPage, ModelsPage } from './pages/Placeholders';
import { SettingsPage } from './pages/SettingsPage';
import { SystemPage } from './pages/SystemPage';
import { onAuthRequired } from './services/api';
import type { SecretKind } from './services/auth';
import { PAGES } from './utils/routes';

function Shell() {
  const [page, navigate] = useRoute();
  const [nav, setNav] = useState(false);
  const [ask, setAsk] = useState<SecretKind | null>(null);

  // A 401 anywhere opens the matching key dialog (docs/02 §5).
  useEffect(() => onAuthRequired((kind) => setAsk(kind)), []);

  const title = PAGES.find((p) => p.id === page)?.title ?? '';
  useEffect(() => {
    document.title = `${title} · Qubivex`;
  }, [title]);

  return (
    <div className="flex h-full">
      <Sidebar page={page} onNavigate={navigate} open={nav} onClose={() => setNav(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onMenu={() => setNav(true)} onKeys={() => navigate('settings')}>
          {page === 'chat' && <ModelSelect />}
        </Header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          {/* Chat stays mounted so a reply keeps streaming while another page is open. */}
          <div className={page === 'chat' ? 'h-full' : 'hidden'}>
            <ChatPage onAskKey={() => setAsk('api')} />
          </div>
          {page === 'metrics' && <MetricsPage />}
          {page === 'models' && <ModelsPage />}
          {page === 'system' && <SystemPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      <AuthDialog kind={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

export function App() {
  return (
    <RuntimeProvider>
      <Shell />
    </RuntimeProvider>
  );
}
