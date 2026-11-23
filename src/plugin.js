'use strict';

const {getLanguage, MarkdownView, Notice, Plugin, PluginSettingTab, Setting} = require('obsidian');
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

function convertSelection(editor) {
  const value = convertInEditor(editor, editor.getSelection());
  if (value === null) new Notice('选区已保留原样。');
  else editor.replaceSelection(value);
}

class FormulaToNoteSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    const language = getLanguage?.() ?? globalThis.navigator?.language ?? 'en';
    const chinese = language.toLowerCase().startsWith('zh');
    new Setting(this.containerEl)
      .setName(chinese ? '粘贴时自动转换' : 'Convert on paste')
      .setDesc(chinese
        ? '粘贴到笔记时自动排版公式并整理符号表。关闭时使用 Obsidian 的常规粘贴。'
        : 'Format equations and rebuild symbol tables when pasting into a note. Turn this off to use the standard Obsidian paste.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.convertOnPaste)
        .onChange(async enabled => {
          toggle.setDisabled(true);
          const settings = {...this.plugin.settings, convertOnPaste: enabled};
          try {
            await this.plugin.saveData(settings);
            this.plugin.settings = settings;
          } catch (error) {
            console.warn('Formula to Note could not save its settings.', error);
            toggle.setValue(this.plugin.settings.convertOnPaste);
            new Notice(chinese ? '未能保存粘贴设置，请重试。' : 'Could not save the paste setting. Please try again.');
          } finally {
            toggle.setDisabled(false);
          }
        }));
  }
}

module.exports = class FormulaToNote extends Plugin {
  async onload() {
    const saved = await this.loadData().catch(error => {
      console.warn('Formula to Note could not load its settings.', error);
      return null;
    });
    this.settings = {...saved, convertOnPaste: saved?.convertOnPaste !== false};
    this.addSettingTab(new FormulaToNoteSettings(this.app, this));

    this.registerEvent(this.app.workspace.on('editor-paste', (event, editor) => {
      if (!this.settings.convertOnPaste) return;
      const data = event.clipboardData;
      if (event.defaultPrevented || !data || data.files?.length || editor.listSelections().length !== 1) return;
      if (data.getData('text/html').includes('<!-- obsidian -->')) return;
      let output;
      try {
        const clip = converter.readClipboard(data, event.target?.ownerDocument);
        if (!clip.value || clip.warning) return;
        if (!clip.richMath && !/[\\$_^]|\]\(|符号|Prompt/i.test(clip.value)) return;
        output = convertInEditor(editor, clip.value, clip.richMath);
      } catch (error) {
        console.warn('Formula to Note could not read this paste.', error);
        return;
      }
      if (output === null) return;
      event.preventDefault();
      editor.replaceSelection(output);
    }));

    this.addRibbonIcon('sigma', '转换公式（选区或整篇笔记）', () =>
      this.convertFromRibbon().catch(error => {
        console.warn('Formula to Note could not convert the active note.', error);
        new Notice('转换未完成，请重新打开笔记后再试。');
      }));

    this.addCommand({
      id: 'convert-selection',
      name: 'Convert selected text to a formula note / 转换选区',
      editorCheckCallback(checking, editor) {
        if (!editor.somethingSelected() || editor.listSelections().length !== 1) return false;
        if (!checking) convertSelection(editor);
        return true;
      },
    });
  }

  async convertFromRibbon() {
    const workspace = this.app.workspace;
    let view = workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice('请先打开一篇 Markdown 笔记。');
      return;
    }

    const reading = view.getMode() === 'preview';
    if (reading) {
      // Use the live editor's undo history, including when starting in Reading view.
      const {leaf, file} = view;
      const state = leaf.getViewState();
      await leaf.setViewState({...state, state: {...state.state, mode: 'source'}});
      view = workspace.getActiveViewOfType(MarkdownView);
      if (view?.leaf !== leaf || view.file !== file || view.getMode() !== 'source') return;
    }

    const editor = view.editor;
    if (!reading && editor.listSelections().length !== 1) {
      new Notice('请保留一个光标或选区，再点击转换。');
      return;
    }
    if (!reading && editor.somethingSelected()) {
      convertSelection(editor);
    } else {
      const source = editor.getValue();
      const {value} = converter.convertNote(source, {unwrap: false});
      if (value === source) {
        new Notice('当前笔记没有需要转换的内容。');
        return;
      }
      editor.replaceRange(value, {line: 0, ch: 0}, editor.offsetToPos(source.length));
    }
    editor.focus();
  }
};
