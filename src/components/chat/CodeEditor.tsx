// A read-only Monaco editor sized to its content. Loaded lazily by CodeBlock.
import { useEffect, useRef, useState } from 'react';
import { monaco } from './monaco';

const LINE_HEIGHT = 20;
const PADDING = 12;
/** Taller blocks scroll inside the editor. */
const MAX_HEIGHT = 600;

function heightFor(lines: number): number {
  return Math.min(lines * LINE_HEIGHT + 2 * PADDING, MAX_HEIGHT);
}

export default function CodeEditor({ code, language }: { code: string; language: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Start at the line-count height so the swap from the plain <pre> does not jump.
  const [height, setHeight] = useState(() => heightFor(code.split('\n').length));

  useEffect(() => {
    if (!host.current) return;
    const model = monaco.editor.createModel(code, language);
    const ed = monaco.editor.create(host.current, {
      model,
      theme: 'qubivex',
      readOnly: true,
      domReadOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: LINE_HEIGHT,
      padding: { top: PADDING, bottom: PADDING },
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 8,
      glyphMargin: false,
      folding: true,
      showFoldingControls: 'mouseover',
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      stickyScroll: { enabled: false },
      guides: { indentation: false, bracketPairs: false },
      contextmenu: true,
      // Let the page scroll when the wheel is over a block that has nothing to scroll.
      scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    editor.current = ed;
    const sub = ed.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) setHeight(Math.min(e.contentHeight, MAX_HEIGHT));
    });
    setHeight(Math.min(ed.getContentHeight(), MAX_HEIGHT));
    return () => {
      sub.dispose();
      ed.dispose();
      model.dispose();
      editor.current = null;
    };
    // Created once; later code/language changes are applied by the effect below.
  }, []);

  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    if (model.getValue() !== code) model.setValue(code);
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
  }, [code, language]);

  return <div ref={host} style={{ height }} className="w-full" />;
}
