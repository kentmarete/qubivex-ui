// A rehype plugin that highlights fenced code with the languages in ./languages only.
// (rehype-highlight always bundles lowlight's 37 "common" grammars.)
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { createLowlight } from 'lowlight';
import { LANGUAGES } from './languages';

const lowlight = createLowlight(LANGUAGES);
lowlight.registerAlias({ bash: ['sh', 'zsh'], javascript: ['js', 'jsx'], typescript: ['ts', 'tsx'], xml: ['html'], ini: ['toml'] });

function text(node: ElementContent | RootContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(text).join('');
  return '';
}

function language(code: Element): string | null {
  const cls = code.properties?.className;
  const list = Array.isArray(cls) ? cls : [];
  for (const c of list) {
    const s = String(c);
    if (s.startsWith('language-')) return s.slice('language-'.length).toLowerCase();
  }
  return null;
}

function visit(node: Root | Element): void {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (child.tagName === 'pre') {
      const code = child.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
      const lang = code ? language(code) : null;
      if (code && lang && lowlight.registered(lang)) {
        const tree = lowlight.highlight(lang, text(code));
        code.children = tree.children as ElementContent[];
        const cls = Array.isArray(code.properties.className) ? code.properties.className : [];
        code.properties.className = [...cls, 'hljs'];
      }
      continue;
    }
    visit(child);
  }
}

export function rehypeHighlightSome() {
  return (tree: Root) => visit(tree);
}
