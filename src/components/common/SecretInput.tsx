import { Eye } from 'lucide-react';
import { useState } from 'react';

/** A masked input; the value shows only while the eye button is held. */
export function SecretInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={reveal ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 pr-9 font-mono text-[13px] placeholder:text-muted/60"
      />
      <button
        type="button"
        aria-label="Hold to show"
        onPointerDown={() => setReveal(true)}
        onPointerUp={() => setReveal(false)}
        onPointerLeave={() => setReveal(false)}
        className="absolute right-1 top-1 rounded p-1.5 text-muted hover:text-text"
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  );
}
