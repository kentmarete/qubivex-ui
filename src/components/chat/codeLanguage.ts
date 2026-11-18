// Maps a fenced code block's language tag (```py) to a Monaco language id.
const ALIASES: Record<string, string> = {
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  rs: 'rust',
  rb: 'ruby',
  yml: 'yaml',
  toml: 'ini',
  'c++': 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  kt: 'kotlin',
  ps1: 'powershell',
  md: 'markdown',
  htm: 'html',
  svg: 'xml',
  jsonc: 'json',
  json5: 'json',
  docker: 'dockerfile',
  proto: 'protobuf',
  golang: 'go',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  objc: 'objective-c',
  tf: 'hcl',
  terraform: 'hcl',
};

/** The Monaco language id for a fence tag; Monaco shows unknown ids as plain text. */
export function monacoLanguage(tag: string | null): string {
  if (!tag) return 'plaintext';
  const t = tag.toLowerCase();
  return ALIASES[t] ?? t;
}
