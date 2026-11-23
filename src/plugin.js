'use strict';

const {Plugin, Notice} = require('obsidian');
const createFormulaNotes = require('./converter');
const markdownIt = require('../vendor/markdown-it.min.js');
const converter = createFormulaNotes(markdownIt);

function convertInEditor(editor, input, fromRich = false) {
  const source = editor.getValue();
  const start = editor.posToOffset(editor.getCursor('from'));
  const end = editor.posToOffset(editor.getCursor('to'));
  const context = converter.editorContext(source, start, end);
  if (!context) return null;
  const result = converter.convertNote(input, {...context, unwrap: false});
  // A single display equation can fit in a cell. An entire note cannot.
  if (context.tableCell && result.value.includes('\n')) return null;
  if (!fromRich && result.value === input.replace(/\r\n?/g, '\n')) return null;
  if (context.tableCell && start === end) return result.value.replace(/(?<!\\)\|/g, '\\|');
  return result.value;
}

module.exports = class FormulaToNote extends Plugin {
  onload() {
    this.registerEvent(this.app.workspace.on('editor-paste', (event, editor) => {
      const data = event.clipboardData;
      if (event.defaultPrevented || !data || data.files?.length || editor.listSelections().length !== 1) return;
      if (data.getData('text/html').includes('<!-- obsidian -->')) return;
      let output;
      try {
        const clip = converter.readClipboard(data, event.target?.ownerDocument);
        if (!clip.value || clip.warning) return;
        if (!clip.richMath && !/[\\$]|\]\(|符号|Prompt/i.test(clip.value)) return;
        output = convertInEditor(editor, clip.value, clip.richMath);
      } catch (error) {
        console.warn('Formula to Note could not read this paste.', error);
        return;
      }
      if (output === null) return;
      event.preventDefault();
      editor.replaceSelection(output);
    }));

    this.addCommand({
      id: 'convert-selection',
      name: 'Convert selected text to a formula note / 转换选区',
      editorCheckCallback(checking, editor) {
        if (!editor.somethingSelected() || editor.listSelections().length !== 1) return false;
        if (!checking) {
          const value = convertInEditor(editor, editor.getSelection());
          if (value === null) new Notice('选区已保留原样。');
          else editor.replaceSelection(value);
        }
        return true;
      },
    });
  }
};
