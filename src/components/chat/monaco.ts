// Monaco, trimmed to what a read-only code viewer needs. This module is only reached through
// a dynamic import (see CodeBlock), so none of it is in the main bundle.
//
// Monaco's `editor.main` would also pull in the TypeScript, CSS and HTML language services
// (several MB of workers). Instead this loads the bare editor API, a few editor features,
// the syntax grammars (each one is its own lazily loaded chunk), and the JSON mode.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker.js?worker';

import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/features/codeEditor/register.js';
import 'monaco-editor/features/codicon/register.js';
import 'monaco-editor/features/bracketMatching/register.js';
import 'monaco-editor/features/clipboard/register.js';
import 'monaco-editor/features/contextmenu/register.js';
import 'monaco-editor/features/cursorUndo/register.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/features/folding/register.js';
import 'monaco-editor/features/hover/register.js';
import 'monaco-editor/features/lineSelection/register.js';
import 'monaco-editor/features/links/register.js';
import 'monaco-editor/features/multicursor/register.js';
import 'monaco-editor/features/readOnlyMessage/register.js';
import 'monaco-editor/features/smartSelect/register.js';
import 'monaco-editor/features/tokenization/register.js';
import 'monaco-editor/features/wordHighlighter/register.js';
import 'monaco-editor/features/wordOperations/register.js';
import 'monaco-editor/languages/definitions/register.all.js';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register.js';

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

// Model output is often a fragment; don't underline it as invalid JSON.
jsonDefaults.setDiagnosticsOptions({ validate: false });

// Matches the highlight.js colours in styles/index.css, so a block keeps its look when it
// switches from the streaming view to the editor.
monaco.editor.defineTheme('qubivex', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e6ebe8' },
    { token: 'keyword', foreground: '7cc4fa' },
    { token: 'string', foreground: '9ee6b8' },
    { token: 'string.key.json', foreground: 'e6c07b' },
    { token: 'string.value.json', foreground: '9ee6b8' },
    { token: 'keyword.json', foreground: 'f5c26b' },
    { token: 'attribute.name', foreground: 'e6c07b' },
    { token: 'attribute.value', foreground: '9ee6b8' },
    { token: 'number', foreground: 'f5c26b' },
    { token: 'comment', foreground: '6b746f', fontStyle: 'italic' },
    { token: 'type', foreground: 'c792ea' },
    { token: 'tag', foreground: '7cc4fa' },
    { token: 'metatag', foreground: '8a948f' },
    { token: 'annotation', foreground: '8a948f' },
    { token: 'regexp', foreground: 'f5c26b' },
    { token: 'delimiter', foreground: 'aab3ae' },
  ],
  colors: {
    'editor.background': '#0e1110',
    'editor.foreground': '#e6ebe8',
    'editorLineNumber.foreground': '#4a524e',
    'editorLineNumber.activeForeground': '#8a948f',
    'editor.selectionBackground': '#3ecf8e40',
    'editor.inactiveSelectionBackground': '#3ecf8e26',
    'editor.wordHighlightBackground': '#ffffff14',
    'editor.findMatchBackground': '#f5a52466',
    'editor.findMatchHighlightBackground': '#f5a52433',
    'editorCursor.foreground': '#3ecf8e',
    'editorBracketMatch.background': '#3ecf8e26',
    'editorBracketMatch.border': '#3ecf8e80',
    'editorWidget.background': '#121514',
    'editorWidget.border': '#232826',
    'scrollbarSlider.background': '#ffffff1a',
    'scrollbarSlider.hoverBackground': '#ffffff2e',
    'scrollbarSlider.activeBackground': '#ffffff40',
    focusBorder: '#3ecf8eb3',
    // No rainbow brackets: they render in the punctuation colour.
    'editorBracketHighlight.foreground1': '#aab3ae',
    'editorBracketHighlight.foreground2': '#aab3ae',
    'editorBracketHighlight.foreground3': '#aab3ae',
    'editorBracketHighlight.foreground4': '#aab3ae',
    'editorBracketHighlight.foreground5': '#aab3ae',
    'editorBracketHighlight.foreground6': '#aab3ae',
  },
});

export { monaco };
