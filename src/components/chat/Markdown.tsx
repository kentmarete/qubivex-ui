import { memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Element } from 'hast';
import { CodeBlock } from './CodeBlock';
import { rehypeHighlightSome } from './highlight';

/** Plain text of a rendered node tree, for the code block copy button. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** The fence tag of a <pre><code class="language-x">, if any. */
function fenceLanguage(pre: Element | undefined): string | null {
  const code = pre?.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
  const cls = code?.properties?.className;
  for (const c of Array.isArray(cls) ? cls : []) {
    const s = String(c);
    if (s.startsWith('language-')) return s.slice('language-'.length);
  }
  return null;
}

function components(editor: boolean): Components {
  return {
    pre({ node, children }) {
      return (
        <CodeBlock code={textOf(children).replace(/\n$/, '')} lang={fenceLanguage(node)} editor={editor}>
          {children}
        </CodeBlock>
      );
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
    },
  };
}

// Code blocks are plain highlighted text while a reply streams (re-rendering an editor per
// token is costly) and Monaco editors once it is complete.
const STREAMING = components(false);
const COMPLETE = components(true);

/** Model output as markdown. Raw HTML is not rendered (react-markdown's default). */
export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="prose-q">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlightSome]} components={streaming ? STREAMING : COMPLETE}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
