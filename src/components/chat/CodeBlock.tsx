import { Component, lazy, Suspense, type ReactNode } from 'react';
import { CopyButton } from '../common/CopyButton';
import { monacoLanguage } from './codeLanguage';

const CodeEditor = lazy(() => import('./CodeEditor'));

/** Falls back to the plain block if Monaco fails to load or render. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A fenced code block. While the reply streams it is the highlighted <pre> (`children`);
 * once the reply is complete it becomes a read-only Monaco editor.
 */
export function CodeBlock({ code, lang, editor, children }: { code: string; lang: string | null; editor: boolean; children: ReactNode }) {
  const plain = <pre>{children}</pre>;
  return (
    <div className="code-block overflow-hidden rounded-md border border-border bg-[#0e1110]">
      <div className="flex items-center justify-between border-b border-border bg-surface/60 py-0.5 pl-3 pr-1">
        <span className="font-mono text-[11.5px] text-muted">{lang ?? 'text'}</span>
        <CopyButton text={code} />
      </div>
      {editor ? (
        <Fallback fallback={plain}>
          <Suspense fallback={plain}>
            <CodeEditor code={code} language={monacoLanguage(lang)} />
          </Suspense>
        </Fallback>
      ) : (
        plain
      )}
    </div>
  );
}
