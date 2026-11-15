import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function Composer({ onSend, onStop, streaming, disabled, disabledReason }: { onSend: (text: string) => void; onStop: () => void; streaming: boolean; disabled: boolean; disabledReason?: string }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 240)}px`;
  }, [text]);

  const submit = () => {
    if (disabled || streaming || !text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-lg border border-border bg-surface p-2 focus-within:border-muted/50"
    >
      {/* Attachments render here once the API accepts non-text parts (capabilities.multimodal). */}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={disabled ? disabledReason : 'Message the model. Enter sends, Shift+Enter for a new line'}
        disabled={disabled}
        aria-label="Message"
        className="max-h-60 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 placeholder:text-muted/70 focus:outline-none disabled:cursor-not-allowed"
      />
      {streaming ? (
        <button type="button" onClick={onStop} aria-label="Stop generating" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text hover:bg-border">
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled || !text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-[#06120c] hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
