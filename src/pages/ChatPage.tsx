import { Eraser, History, KeyRound, MessageSquarePlus, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatSettingsPanel } from '../components/chat/ChatSettingsPanel';
import { Composer } from '../components/chat/Composer';
import { MessageView } from '../components/chat/MessageView';
import { Dialog } from '../components/common/Dialog';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { Unavailable } from '../components/common/Unavailable';
import { Button } from '../components/common/ui';
import { DEFAULT_SETTINGS, useChat, type ChatSettings } from '../hooks/useChat';
import { useGenerationPrefs } from '../hooks/useGenerationPrefs';
import { useRuntime } from '../hooks/useRuntime';
import { loadJson, saveJson } from '../utils/storage';

const settingsKey = (model: string) => `qubivex.chat.settings.${model}`;

export function ChatPage({ onAskKey }: { onAskKey: () => void }) {
  const rt = useRuntime();
  const chat = useChat();
  const model = rt.selectedModel;
  const prefs = useGenerationPrefs();
  const defaults: ChatSettings = { ...DEFAULT_SETTINGS, maxTokens: prefs.defaultMaxTokens };
  const [settings, setSettings] = useState<ChatSettings>(defaults);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Settings are remembered per model; a model without any starts from the Settings page's defaults.
  useEffect(() => {
    if (model) setSettings(loadJson(settingsKey(model), { ...DEFAULT_SETTINGS, maxTokens: prefs.defaultMaxTokens }));
  }, [model, prefs.defaultMaxTokens]);
  const updateSettings = (s: ChatSettings) => {
    setSettings(s);
    if (model) saveJson(settingsKey(model), s);
  };

  // Follow the reply while the reader is at the bottom; stop following if they scroll up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [chat.conversation.messages]);

  const maxContext = rt.system?.models.find((m) => m.id === model)?.max_context ?? null;
  const maxTokensCap = rt.system?.limits?.max_generation_tokens ?? null;
  // Above the server's --max-generation-tokens is a 400, so ask for at most that. Past the
  // context is fine: the server stops when the context is full.
  const sent: ChatSettings = maxTokensCap && settings.maxTokens > maxTokensCap ? { ...settings, maxTokens: maxTokensCap } : settings;
  const messages = chat.conversation.messages;

  let blocker: React.ReactNode = null;
  if (rt.health === 'down') {
    blocker = <ErrorPanel title="Cannot reach the Qubivex API" error={rt.healthError ?? 'The server is not answering'} />;
  } else if (rt.access === 'required') {
    blocker = (
      <Unavailable title="An API key is required">
        <p className="mb-3">This server needs an API key for chat.</p>
        <Button variant="primary" onClick={onAskKey}>
          <KeyRound className="h-4 w-4" /> Enter API key
        </Button>
      </Unavailable>
    );
  } else if (rt.modelsError && rt.models.length === 0) {
    blocker = <ErrorPanel title="Could not list models" error={rt.modelsError} />;
  } else if (rt.health !== 'checking' && rt.access !== 'unknown' && rt.models.length === 0) {
    blocker = (
      <Unavailable title="No model is loaded">
        Start the server with <code className="font-mono">qubivex serve --model &lt;id&gt;</code>, or load one through the admin API.
      </Unavailable>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
          <Button size="sm" variant="ghost" onClick={chat.newConversation} disabled={messages.length === 0}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} disabled={messages.length === 0}>
            <Eraser className="h-3.5 w-3.5" /> Clear
          </Button>
          {chat.history.length > 0 && (
            <label className="ml-1 flex items-center gap-1.5 text-[13px] text-muted">
              <History className="h-3.5 w-3.5" />
              <span className="sr-only">Earlier conversations</span>
              <select
                value=""
                onChange={(e) => e.target.value && chat.open(e.target.value)}
                disabled={chat.streaming}
                className="h-7 max-w-[180px] truncate rounded-md border border-border bg-surface-2 px-1.5 text-[13px]"
              >
                <option value="">Earlier ({chat.history.length})</option>
                {chat.history.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" variant={showSettings ? 'secondary' : 'ghost'} className="ml-auto" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Settings
          </Button>
        </div>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-[820px] space-y-6 px-4 py-6">
            {blocker}
            {!blocker && messages.length === 0 && (
              <div className="pt-16 text-center text-muted">
                <div className="text-[15px] text-text">Start a conversation</div>
                <div className="mt-1 text-[13px]">
                  Replies stream from <span className="font-mono">{model ?? '…'}</span> through the Qubivex runtime.
                </div>
              </div>
            )}
            {messages.map((m) => (
              <MessageView key={m.id} m={m} canRetry={!chat.streaming && !!model} onRetry={() => model && chat.retry(m.id, model, sent)} />
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[820px] shrink-0 px-4 pb-4">
          <Composer
            streaming={chat.streaming}
            onStop={chat.stop}
            onSend={(t) => {
              pinned.current = true;
              if (model) chat.send(t, model, sent);
            }}
            disabled={!model || !!blocker}
            disabledReason={!model ? 'No model selected' : 'Chat is unavailable'}
          />
        </div>
      </div>

      {showSettings && (
        <aside className="fixed inset-y-0 right-0 z-30 w-[300px] overflow-y-auto border-l border-border bg-surface p-4 shadow-2xl xl:static xl:shadow-none" aria-label="Generation settings">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">Generation</h2>
            <button type="button" onClick={() => setShowSettings(false)} className="rounded p-1 text-muted hover:text-text" aria-label="Close settings">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatSettingsPanel value={settings} onChange={updateSettings} maxContext={maxContext} maxTokensCap={maxTokensCap} defaults={defaults} />
        </aside>
      )}

      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear this conversation?">
        <p className="mb-4 text-[13px] text-muted">Its messages are removed from this page. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              chat.clear();
              setConfirmClear(false);
            }}
          >
            Clear
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
