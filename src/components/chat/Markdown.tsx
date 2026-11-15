import { memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from '../common/CopyButton';
import { rehypeHighlightSome } from './highlight';

/** Plain text of a rendered node tree, for the code block copy button. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

const components: Components = {
  pre({ children }) {
    return (
      <div className="group relative">
        <pre>{children}</pre>
        <CopyButton text={textOf(children).replace(/\n$/, '')} className="absolute right-1.5 top-1.5 bg-surface/90 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" />
      </div>
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

/** Model output as markdown. Raw HTML is not rendered (react-markdown's default). */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-q">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlightSome]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
