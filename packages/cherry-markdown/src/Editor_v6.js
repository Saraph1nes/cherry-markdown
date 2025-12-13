/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// @ts-check
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { search, SearchQuery } from '@codemirror/search';
import { history, historyKeymap } from '@codemirror/commands';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lineNumbers } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { Decoration, WidgetType } from '@codemirror/view';
import htmlParser from '@/utils/htmlparser';
import pasteHelper from '@/utils/pasteHelper';
import { addEvent } from './utils/event';
import Logger from '@/Logger';
import { handleFileUploadCallback } from '@/utils/file';
import { createElement } from './utils/dom';
import { longTextReg, base64Reg, imgDrawioXmlReg, createUrlReg } from './utils/regexp';
import { handleNewlineIndentList } from './utils/autoindent';

/**
 * @typedef {import('~types/editor').EditorConfiguration} EditorConfiguration
 * @typedef {import('~types/editor').EditorEventCallback} EditorEventCallback
 * @typedef {import('codemirror')} CodeMirror
 */

/**
 * CodeMirror 6 适配器 - 提供与 CodeMirror 5 兼容的 API
 */
class CM6Adapter {
  constructor(view) {
    this.view = view;
    this._eventHandlers = new Map();
  }

  // 获取当前值
  getValue() {
    return this.view.state.doc.toString();
  }

  // 设置值
  setValue(value) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
    });
  }

  // 获取选中文本
  getSelection() {
    const { from, to } = this.view.state.selection.main;
    return this.view.state.doc.sliceString(from, to);
  }

  // 获取多选区文本
  getSelections() {
    return this.view.state.selection.ranges.map((range) => this.view.state.doc.sliceString(range.from, range.to));
  }

  // 替换选中文本
  replaceSelection(text, select = 'around') {
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: select === 'around' ? { anchor: from + text.length } : undefined,
    });
  }

  // 替换多选区文本
  replaceSelections(texts, select = 'around') {
    const ranges = this.view.state.selection.ranges;
    const changes = ranges.map((range, i) => ({
      from: range.from,
      to: range.to,
      insert: texts[i] || '',
    }));
    this.view.dispatch({ changes });
  }

  // 获取光标位置
  getCursor(type = 'head') {
    const pos = type === 'head' ? this.view.state.selection.main.head : this.view.state.selection.main.anchor;
    return this.posToLineAndCh(pos);
  }

  // 设置光标位置
  setCursor(line, ch) {
    const pos = this.lineAndChToPos(line, ch);
    this.view.dispatch({ selection: { anchor: pos } });
  }

  // 设置选区
  setSelection(from, to) {
    const fromPos = typeof from === 'object' ? this.lineAndChToPos(from.line, from.ch) : from;
    const toPos = to ? (typeof to === 'object' ? this.lineAndChToPos(to.line, to.ch) : to) : fromPos;
    this.view.dispatch({ selection: { anchor: fromPos, head: toPos } });
  }

  // 获取选区列表
  listSelections() {
    return this.view.state.selection.ranges.map((range) => ({
      anchor: this.posToLineAndCh(range.anchor),
      head: this.posToLineAndCh(range.head),
    }));
  }

  // 获取行内容
  getLine(line) {
    const lineObj = this.view.state.doc.line(line + 1);
    return lineObj.text;
  }

  // 获取行数
  lineCount() {
    return this.view.state.doc.lines;
  }

  // 获取范围内的文本
  getRange(from, to) {
    const fromPos = this.lineAndChToPos(from.line, from.ch);
    const toPos = this.lineAndChToPos(to.line, to.ch);
    return this.view.state.doc.sliceString(fromPos, toPos);
  }

  // 替换范围内的文本
  replaceRange(text, from, to) {
    const fromPos = this.lineAndChToPos(from.line, from.ch);
    const toPos = to ? this.lineAndChToPos(to.line, to.ch) : fromPos;
    this.view.dispatch({
      changes: { from: fromPos, to: toPos, insert: text },
    });
  }

  // 获取文档对象(兼容性)
  getDoc() {
    return this;
  }

  // 位置转换: pos -> {line, ch}
  posToLineAndCh(pos) {
    const line = this.view.state.doc.lineAt(pos);
    return { line: line.number - 1, ch: pos - line.from };
  }

  // 位置转换: {line, ch} -> pos
  lineAndChToPos(line, ch) {
    if (typeof line === 'object') {
      ch = line.ch;
      line = line.line;
    }
    const lineObj = this.view.state.doc.line(line + 1);
    return lineObj.from + Math.min(ch, lineObj.length);
  }

  // 光标坐标
  cursorCoords(where, mode = 'page') {
    const pos = where ? this.lineAndChToPos(where.line, where.ch) : this.view.state.selection.main.head;
    const coords = this.view.coordsAtPos(pos);
    if (!coords) return { left: 0, top: 0, bottom: 0 };
    return coords;
  }

  // 字符坐标
  charCoords(pos, mode = 'page') {
    return this.cursorCoords(pos, mode);
  }

  // 坐标转字符位置
  coordsChar(coords) {
    const pos = this.view.posAtCoords(coords);
    return pos ? this.posToLineAndCh(pos) : { line: 0, ch: 0 };
  }

  // 滚动到指定位置
  scrollTo(x, y) {
    if (y !== null && y !== undefined) {
      this.view.scrollDOM.scrollTop = y;
    }
    if (x !== null && x !== undefined) {
      this.view.scrollDOM.scrollLeft = x;
    }
  }

  // 滚动到视图
  scrollIntoView(pos) {
    const position = this.lineAndChToPos(pos.line, pos.ch);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(position),
    });
  }

  // 获取滚动信息
  getScrollInfo() {
    return {
      left: this.view.scrollDOM.scrollLeft,
      top: this.view.scrollDOM.scrollTop,
      height: this.view.scrollDOM.scrollHeight,
      width: this.view.scrollDOM.scrollWidth,
      clientHeight: this.view.scrollDOM.clientHeight,
      clientWidth: this.view.scrollDOM.clientWidth,
    };
  }

  // 获取行高度位置的行号
  lineAtHeight(height, mode = 'page') {
    const pos = this.view.posAtCoords({ x: 0, y: height });
    if (!pos) return 0;
    return this.view.state.doc.lineAt(pos).number - 1;
  }

  // 获取包装元素
  getWrapperElement() {
    return this.view.dom;
  }

  // 获取滚动元素
  getScrollerElement() {
    return this.view.scrollDOM;
  }

  // 刷新编辑器
  refresh() {
    this.view.requestMeasure();
  }

  // 聚焦
  focus() {
    this.view.focus();
  }

  // 设置选项
  setOption(option, value) {
    switch (option) {
      case 'value':
        this.setValue(value);
        break;
      case 'keyMap':
        console.warn('keyMap switching not fully implemented in CM6');
        break;
      default:
        console.warn(`Option ${option} not supported in CM6 adapter`);
    }
  }

  // 获取选项
  getOption(option) {
    return null;
  }

  // 标记文本
  markText(from, to, options) {
    const fromPos = this.lineAndChToPos(from.line, from.ch);
    const toPos = this.lineAndChToPos(to.line, to.ch);

    const decoration = options.replacedWith
      ? Decoration.replace({ widget: new ReplacementWidget(options.replacedWith) })
      : Decoration.mark({
          class: options.className,
          attributes: options.title ? { title: options.title } : undefined,
        });

    this.view.dispatch({
      effects: addMark.of({ from: fromPos, to: toPos, decoration, options }),
    });

    return {
      clear: () => {
        this.view.dispatch({
          effects: removeMark.of({ from: fromPos, to: toPos }),
        });
      },
      find: () => ({ from, to }),
      className: options.className,
    };
  }

  // 查找标记
  findMarks(from, to) {
    return [];
  }

  // 获取所有标记
  getAllMarks() {
    return [];
  }

  // 查找单词
  findWordAt(pos) {
    const position = this.lineAndChToPos(pos.line, pos.ch);
    const line = this.view.state.doc.lineAt(position);
    const text = line.text;
    const ch = position - line.from;

    let start = ch,
      end = ch;
    const wordRe = /\w/;

    while (start > 0 && wordRe.test(text[start - 1])) start--;
    while (end < text.length && wordRe.test(text[end])) end++;

    return {
      anchor: { line: pos.line, ch: start },
      head: { line: pos.line, ch: end },
    };
  }

  // 获取搜索游标
  getSearchCursor(query, pos) {
    const searchQuery = new SearchQuery({
      search: typeof query === 'string' ? query : query.source,
      regexp: query instanceof RegExp,
    });

    let currentPos = pos ? this.lineAndChToPos(pos.line, pos.ch) : 0;
    const doc = this.view.state.doc;

    return {
      findNext: () => {
        const result = searchQuery.getCursor(doc, currentPos).next();
        if (result.done) return false;

        currentPos = result.value.to;
        this._lastSearchResult = result.value;

        const matched = doc.sliceString(result.value.from, result.value.to);
        const match = query instanceof RegExp ? matched.match(query) : [matched];
        return match || false;
      },
      from: () => {
        if (!this._lastSearchResult) return null;
        return this.posToLineAndCh(this._lastSearchResult.from);
      },
      to: () => {
        if (!this._lastSearchResult) return null;
        return this.posToLineAndCh(this._lastSearchResult.to);
      },
    };
  }

  // 事件监听
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  // 触发事件
  _emit(event, ...args) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(this, ...args));
    }
  }

  // 执行命令
  execCommand(command) {
    console.warn(`Command ${command} not implemented in CM6 adapter`);
  }

  // 保存到 textarea (兼容)
  save() {
    // CM6 不需要这个功能
  }

  // 获取行句柄
  getLineHandle(line) {
    return {
      height: 20,
    };
  }
}

// 替换 Widget
class ReplacementWidget extends WidgetType {
  constructor(dom) {
    super();
    this.dom = dom;
  }

  toDOM() {
    return this.dom;
  }
}

// Mark 状态管理
const addMark = StateEffect.define();
const removeMark = StateEffect.define();

const markField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (let effect of tr.effects) {
      if (effect.is(addMark)) {
        marks = marks.update({
          add: [effect.value.decoration.range(effect.value.from, effect.value.to)],
        });
      } else if (effect.is(removeMark)) {
        marks = marks.update({
          filter: (from, to) => from !== effect.value.from || to !== effect.value.to,
        });
      }
    }
    return marks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** @type {import('~types/editor')} */
export default class Editor {
  /**
   * @constructor
   * @param {Partial<EditorConfiguration>} options
   */
  constructor(options) {
    /**
     * @property
     * @type {EditorConfiguration}
     */
    this.options = {
      id: 'code',
      name: 'code',
      autoSave2Textarea: false,
      editorDom: document.createElement('div'),
      wrapperDom: null,
      autoScrollByCursor: true,
      convertWhenPaste: true,
      keyMap: 'sublime',
      showFullWidthMark: true,
      showSuggestList: true,
      codemirror: {
        lineNumbers: false,
        cursorHeight: 0.85,
        indentUnit: 4,
        tabSize: 4,
        mode: {
          name: 'yaml-frontmatter',
          base: {
            name: 'gfm',
            gitHubSpice: false,
          },
        },
        lineWrapping: true,
        indentWithTabs: true,
        autofocus: true,
        theme: 'default',
        autoCloseTags: true,
        extraKeys: {
          Enter: handleNewlineIndentList,
        },
        matchTags: { bothTags: true },
        placeholder: '',
        keyMap: 'sublime',
      },
      toolbars: {},
      onKeydown() {},
      onChange() {},
      onFocus() {},
      onBlur() {},
      onPaste: this.onPaste,
      onScroll: this.onScroll,
    };
    /**
     * @property
     * @private
     * @type {{ timer?: number; destinationTop?: number }}
     */
    this.animation = {};
    this.selectAll = false;
    const { codemirror, ...restOptions } = options;
    if (codemirror) {
      Object.assign(this.options.codemirror, codemirror);
    }
    Object.assign(this.options, restOptions);
    this.options.codemirror.keyMap = this.options.keyMap;
    this.$cherry = this.options.$cherry;
    this.instanceId = this.$cherry.getInstanceId();
  }

  /**
   * 禁用快捷键
   * @param {boolean} disable 是否禁用快捷键
   */
  disableShortcut = (disable = true) => {
    if (disable) {
      this.editor.setOption('keyMap', 'default');
    } else {
      this.editor.setOption('keyMap', this.options.keyMap);
    }
  };

  /**
   * 在onChange后处理draw.io的xml数据和图片的base64数据，对这种超大的数据增加省略号，
   * 以及对全角符号进行特殊染色。
   */
  dealSpecialWords = () => {
    if (this.$cherry.status.editor === 'hide') {
      return;
    }
    this.formatBigData2Mark(base64Reg, 'cm-url base64');
    this.formatBigData2Mark(imgDrawioXmlReg, 'cm-url drawio');
    this.formatBigData2Mark(longTextReg, 'cm-url long-text');
    if (this.$cherry.options.editor.maxUrlLength > 10) {
      const [protocolUrlPattern, wwwUrlPattern] = createUrlReg(this.$cherry.options.editor.maxUrlLength);
      this.formatBigData2Mark(protocolUrlPattern, 'cm-url url-truncated');
      this.formatBigData2Mark(wwwUrlPattern, 'cm-url url-truncated');
    }
    this.formatFullWidthMark();
  };

  /**
   * 把大字符串变成省略号
   * @param {*} reg 正则
   * @param {*} className 利用codemirror的MarkText生成的新元素的class
   */
  formatBigData2Mark = (reg, className) => {
    const codemirror = this.editor;
    const searcher = codemirror.getSearchCursor(reg);

    let oneSearch = searcher.findNext();
    for (; oneSearch !== false; oneSearch = searcher.findNext()) {
      const target = searcher.from();
      if (!target) {
        continue;
      }
      const bigString = oneSearch[2] ?? '';
      const targetChFrom = target.ch + oneSearch[1]?.length;
      const targetChTo = targetChFrom + bigString.length;
      const targetLine = target.line;
      const begin = { line: targetLine, ch: targetChFrom };
      const end = { line: targetLine, ch: targetChTo };
      if (codemirror.findMarks(begin, end).length > 0) {
        continue;
      }
      const newSpan = createElement('span', `cm-string ${className}`, { title: bigString });
      newSpan.textContent = bigString;
      codemirror.markText(begin, end, { replacedWith: newSpan, atomic: true });
    }
  };

  /**
   * 高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》
   * full width翻译为全角
   */
  formatFullWidthMark() {
    if (!this.options.showFullWidthMark) {
      return;
    }
    const { editor } = this;
    const regex = /[·￥、：""【】（）《》]/;
    const searcher = editor.getSearchCursor(regex);
    let oneSearch = searcher.findNext();
    editor.getAllMarks().forEach(function (mark) {
      if (mark.className === 'cm-fullWidth') {
        const range = JSON.parse(JSON.stringify(mark.find()));
        const markedText = editor.getRange(range.from, range.to);
        if (!regex.test(markedText)) {
          mark.clear();
        }
      }
    });
    for (; oneSearch !== false; oneSearch = searcher.findNext()) {
      const target = searcher.from();
      if (!target) {
        continue;
      }
      const from = { line: target.line, ch: target.ch };
      const to = { line: target.line, ch: target.ch + 1 };
      const existMarksLength = editor.findMarks(from, to).filter((item) => {
        return item.className === 'cm-fullWidth';
      });
      if (existMarksLength.length === 0) {
        editor.markText(from, to, {
          className: 'cm-fullWidth',
          title: '按住Ctrl/Cmd点击切换成半角（Hold down Ctrl/Cmd and click to switch to half-width）',
        });
      }
    }
  }

  /**
   *
   * @param {CodeMirror.Editor} codemirror
   * @param {MouseEvent} evt
   */
  toHalfWidth(codemirror, evt) {
    const { target } = evt;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.classList.contains('cm-fullWidth') && (evt.ctrlKey || evt.metaKey) && evt.buttons === 1) {
      const rect = target.getBoundingClientRect();
      const from = codemirror.coordsChar({ left: rect.left, top: rect.top });
      const to = { line: from.line, ch: from.ch + 1 };
      codemirror.setSelection(from, to);
      codemirror.replaceSelection(
        target.innerText
          .replace('·', '`')
          .replace('￥', '$')
          .replace('、', '/')
          .replace('：', ':')
          .replace('"', '\"')
          .replace('"', '\"')
          .replace('【', '[')
          .replace('】', ']')
          .replace('（', '(')
          .replace('）', ')')
          .replace('《', '<')
          .replace('》', '>'),
      );
    }
  }

  /**
   *
   * @param {KeyboardEvent} e
   * @param {CodeMirror.Editor} codemirror
   */
  onKeyup = (e, codemirror) => {
    const { line: targetLine } = codemirror.getCursor();
    this.previewer.highlightLine(targetLine + 1);
  };

  /**
   *
   * @param {ClipboardEvent} e
   * @param {CodeMirror.Editor} codemirror
   */
  onPaste(e, codemirror) {
    let { clipboardData } = e;
    if (clipboardData) {
      this.handlePaste(e, clipboardData, codemirror);
    } else {
      ({ clipboardData } = window);
      this.handlePaste(e, clipboardData, codemirror);
    }
  }

  /**
   *
   * @param {ClipboardEvent} event
   * @param {ClipboardEvent['clipboardData']} clipboardData
   * @param {CodeMirror.Editor} codemirror
   * @returns {boolean | void}
   */
  handlePaste(event, clipboardData, codemirror) {
    const onPasteRet = this.$cherry.options.callback.onPaste(clipboardData, this.$cherry);
    if (onPasteRet !== false && typeof onPasteRet === 'string') {
      event.preventDefault();
      codemirror.replaceSelection(onPasteRet);
      return;
    }
    let html = clipboardData.getData('Text/Html');
    const { items } = clipboardData;

    html = html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');
    html = html.replace(/<!--[^>]+>/g, '');

    if (
      /<body>\s*<img [^>]+>\s*<\/body>/.test(html) &&
      items[1]?.kind === 'file' &&
      items[1]?.type.match(/^image\//i)
    ) {
      html = '';
    }
    const codemirrorDoc = codemirror.getDoc();
    this.fileUploadCount = 0;
    for (let i = 0; !html && i < items.length; i++) {
      const item = items[i];
      if (item && item.kind === 'file' && item.type.match(/^image\//i)) {
        const file = item.getAsFile();
        this.$cherry.options.callback.fileUpload(file, (url, params = {}) => {
          this.fileUploadCount += 1;
          if (typeof url !== 'string') {
            return;
          }
          const mdStr = `${this.fileUploadCount > 1 ? '\n' : ''}${handleFileUploadCallback(url, params, file)}`;
          codemirrorDoc.replaceSelection(mdStr);
        });
        event.preventDefault();
      }
    }

    const htmlText = clipboardData.getData('text/plain');
    if (!html || !this.options.convertWhenPaste) {
      return true;
    }

    let divObj = document.createElement('DIV');
    divObj.innerHTML = html;
    html = divObj.innerHTML;
    const mdText = htmlParser.run(html);
    if (typeof mdText === 'string' && mdText.trim().length > 0) {
      const range = codemirror.listSelections();
      if (codemirror.getSelections().length <= 1 && range[0] && range[0].anchor) {
        const currentCursor = {};
        currentCursor.line = range[0].anchor.line;
        currentCursor.ch = range[0].anchor.ch;
        codemirrorDoc.replaceSelection(mdText);
        pasteHelper.showSwitchBtnAfterPasteHtml(this.$cherry, currentCursor, codemirror, htmlText, mdText);
      } else {
        codemirrorDoc.replaceSelection(mdText);
      }
      event.preventDefault();
    }
    divObj = null;
  }

  /**
   *
   * @param {CodeMirror.Editor} codemirror
   */
  onScroll = (codemirror) => {
    this.$cherry.$event.emit('cleanAllSubMenus');
    if (this.disableScrollListener) {
      this.disableScrollListener = false;
      return;
    }
    const scroller = codemirror.getScrollerElement();
    if (scroller.scrollTop <= 0) {
      this.previewer.scrollToLineNum(0);
      return;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 20) {
      this.previewer.scrollToLineNum(null);
      return;
    }
    const currentTop = codemirror.getScrollInfo().top;
    const targetLine = codemirror.lineAtHeight(currentTop, 'local');
    const lineRect = codemirror.charCoords({ line: targetLine, ch: 0 }, 'local');
    const lineHeight = codemirror.getLineHandle(targetLine).height;
    const lineTop = lineRect.bottom - lineHeight;
    const percent = (100 * (currentTop - lineTop)) / lineHeight / 100;
    this.previewer.scrollToLineNum(targetLine + 1, percent);
  };

  /**
   *
   * @param {CodeMirror.Editor} codemirror
   * @param {MouseEvent} evt
   */
  onMouseDown = (codemirror, evt) => {
    this.$cherry.$event.emit('cleanAllSubMenus');
    const { line: targetLine } = codemirror.getCursor();
    const top = Math.abs(evt.y - codemirror.getWrapperElement().getBoundingClientRect().y);
    this.previewer.scrollToLineNumWithOffset(targetLine + 1, top);
    this.toHalfWidth(codemirror, evt);
  };

  /**
   * 光标变化事件
   */
  onCursorActivity = () => {
    this.refreshWritingStatus();
  };

  /**
   *
   * @param {*} previewer
   */
  init(previewer) {
    const textArea = this.options.editorDom.querySelector(`#${this.options.id}`);
    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('The specific element is not a textarea.');
    }

    const self = this;

    // 创建 CodeMirror 6 编辑器
    const extensions = [
      markdown(),
      history(),
      search(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle),

      ...(this.options.codemirror.lineNumbers ? [lineNumbers()] : []),

      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        indentWithTab,
        {
          key: 'Enter',
          run: (view) => {
            const adapter = new CM6Adapter(view);
            handleNewlineIndentList(adapter);
            return true;
          },
        },
      ]),

      EditorView.lineWrapping,

      ...(this.options.codemirror.placeholder ? [placeholder(this.options.codemirror.placeholder)] : []),

      markField,

      EditorView.updateListener.of((update) => {
        const adapter = self.editor;
        if (!adapter) return;

        if (update.docChanged) {
          adapter._emit('change', update);
          adapter._emit('beforeChange', adapter);
        }
        if (update.selectionSet) {
          adapter._emit('cursorActivity');
        }
      }),

      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (self.editor) self.editor._emit('keydown', event);
          return false;
        },
        keyup: (event, view) => {
          if (self.editor) self.editor._emit('keyup', event);
          return false;
        },
        mousedown: (event, view) => {
          if (self.editor) self.editor._emit('mousedown', event);
          return false;
        },
        paste: (event, view) => {
          if (self.editor) self.editor._emit('paste', event);
          return false;
        },
        drop: (event, view) => {
          if (self.editor) self.editor._emit('drop', event);
          return false;
        },
        focus: (event, view) => {
          if (self.editor) self.editor._emit('focus', event);
          return false;
        },
        blur: (event, view) => {
          if (self.editor) self.editor._emit('blur', event);
          return false;
        },
        scroll: (event, view) => {
          if (self.editor) self.editor._emit('scroll');
          return false;
        },
      }),
    ];

    const state = EditorState.create({
      doc: this.options.value || textArea.value || '',
      extensions,
    });

    const view = new EditorView({
      state,
      parent: textArea.parentElement,
    });

    textArea.style.display = 'none';

    const editor = new CM6Adapter(view);

    this.previewer = previewer;
    this.disableScrollListener = false;

    this.editor = editor;
    this.editorView = view;

    editor.on('blur', (codemirror, evt) => {
      this.options.onBlur(evt, codemirror);
      this.$cherry.$event.emit('blur', { evt, cherry: this.$cherry });
    });

    editor.on('focus', (codemirror, evt) => {
      this.options.onFocus(evt, codemirror);
      this.$cherry.$event.emit('focus', { evt, cherry: this.$cherry });
    });

    editor.on('change', (codemirror, evt) => {
      this.options.onChange(evt, codemirror);
      this.dealSpecialWords();
      if (this.options.autoSave2Textarea) {
        textArea.value = editor.getValue();
      }
    });

    editor.on('keydown', (codemirror, evt) => {
      this.options.onKeydown(evt, codemirror);
    });

    editor.on('keyup', (codemirror, evt) => {
      this.onKeyup(evt, codemirror);
    });

    editor.on('paste', (codemirror, evt) => {
      this.options.onPaste.call(this, evt, codemirror);
    });

    if (this.options.autoScrollByCursor) {
      editor.on('mousedown', (codemirror, evt) => {
        setTimeout(() => {
          this.onMouseDown(codemirror, evt);
        });
      });
    }

    editor.on('drop', (codemirror, evt) => {
      const files = evt.dataTransfer.files || [];
      if (files && files.length > 0) {
        setTimeout(() => {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileType = file.type || '';
            if (/\.(text|md)/.test(file.name) || /^text/i.test(fileType)) {
              continue;
            }
            this.$cherry.options.callback.fileUpload(file, (url, params = {}) => {
              if (typeof url !== 'string') {
                return;
              }
              codemirror.setSelection(codemirror.getCursor());
              const mdStr = handleFileUploadCallback(url, params, file);
              const insertValue = i > 0 ? `\n${mdStr} ` : `${mdStr} `;
              codemirror.replaceSelection(insertValue);
              this.dealSpecialWords();
            });
          }
        }, 50);
      }
    });

    editor.on('scroll', (codemirror) => {
      this.options.onScroll(codemirror);
      this.options.writingStyle === 'focus' && this.refreshWritingStatus();
    });

    editor.on('cursorActivity', () => {
      this.onCursorActivity();
    });

    editor.on('beforeChange', (codemirror) => {
      this.selectAll = this.editor.getValue() === codemirror.getSelection();
    });

    addEvent(
      this.getEditorDom(),
      'wheel',
      () => {
        this.disableScrollListener = false;
        cancelAnimationFrame(this.animation.timer);
        this.animation.timer = 0;
      },
      false,
    );

    if (this.options.writingStyle !== 'normal') {
      this.initWritingStyle();
    }
    this.dealSpecialWords();

    this.domWidth = this.getEditorDom().offsetWidth;
    const resizeObserver = new ResizeObserver((entries) => {
      if (this.getEditorDom().offsetWidth !== this.domWidth && this.$cherry.status.editor === 'show') {
        this.domWidth = this.getEditorDom().offsetWidth;
        this.editor.refresh();
      }
    });
    resizeObserver.observe(this.getEditorDom());
  }

  /**
   *
   * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
   * @param {number} [endLine] 终止行
   * @param {number} [percent] 百分比，取值0~1
   */
  jumpToLine(beginLine, endLine, percent) {
    if (beginLine === null) {
      cancelAnimationFrame(this.animation.timer);
      this.disableScrollListener = true;
      this.editor.scrollIntoView({
        line: this.editor.lineCount() - 1,
        ch: 1,
      });
      this.animation.timer = 0;
      return;
    }
    const position = this.editor.charCoords({ line: beginLine, ch: 0 }, 'local');
    let { top } = position;
    const positionEnd = this.editor.charCoords({ line: beginLine + endLine, ch: 0 }, 'local');
    const height = positionEnd.top - position.top;
    top += height * percent;
    this.animation.destinationTop = Math.ceil(top - 15);
    if (this.animation.timer) {
      return;
    }
    const animationHandler = () => {
      const currentTop = this.editor.getScrollInfo().top;
      const delta = this.animation.destinationTop - currentTop;
      const move = Math.ceil(Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) / (100 / 16.7))));
      if (delta > 0) {
        if (currentTop >= this.animation.destinationTop) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollTo(null, currentTop + move);
      } else if (delta < 0) {
        if (currentTop <= this.animation.destinationTop || currentTop <= 0) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollTo(null, currentTop - move);
      } else {
        this.animation.timer = 0;
        return;
      }
      if (currentTop === this.editor.getScrollInfo().top || move >= Math.abs(delta)) {
        this.animation.timer = 0;
        return;
      }
      this.animation.timer = requestAnimationFrame(animationHandler);
    };
    this.animation.timer = requestAnimationFrame(animationHandler);
  }

  /**
   *
   * @param {number | null} lineNum
   * @param {number} [endLine]
   * @param {number} [percent]
   */
  scrollToLineNum(lineNum, endLine, percent) {
    if (lineNum === null) {
      this.jumpToLine(null);
      return;
    }
    const $lineNum = Math.max(0, lineNum);
    this.jumpToLine($lineNum, endLine, percent);
    Logger.log('滚动预览区域，左侧应scroll to ', $lineNum);
  }

  /**
   *
   * @returns {HTMLElement}
   */
  getEditorDom() {
    return this.options.editorDom;
  }

  /**
   *
   * @param {string} event 事件名
   * @param {EditorEventCallback} callback 回调函数
   */
  addListener(event, callback) {
    this.editor.on(event, callback);
  }

  /**
   * 初始化书写风格
   */
  initWritingStyle() {
    const { writingStyle } = this.options;
    const className = `cherry-editor-writing-style--${writingStyle}`;
    const editorDom = this.getEditorDom();
    Array.from(editorDom.classList)
      .filter((className) => className.startsWith('cherry-editor-writing-style--'))
      .forEach((className) => editorDom.classList.remove(className));
    if (writingStyle === 'normal') {
      return;
    }
    editorDom.classList.add(className);
    this.refreshWritingStatus();
  }

  /**
   * 刷新书写状态
   */
  refreshWritingStatus() {
    const { writingStyle } = this.options;
    if (writingStyle !== 'focus' && writingStyle !== 'typewriter') {
      return;
    }
    const className = `cherry-editor-writing-style--${writingStyle}`;
    /**
     * @type {HTMLStyleElement}
     */
    const style = document.querySelector('#cherry-editor-writing-style') || document.createElement('style');
    style.id = 'cherry-editor-writing-style';
    Array.from(document.head.childNodes).find((node) => node === style) || document.head.appendChild(style);
    const { sheet } = style;
    Array.from(Array(sheet.cssRules.length)).forEach(() => sheet.deleteRule(0));
    if (writingStyle === 'focus') {
      const editorDomRect = this.getEditorDom().getBoundingClientRect();
      const { top, bottom } = this.editor.charCoords(this.editor.getCursor());
      const topHeight = top - editorDomRect.top;
      const bottomHeight = editorDomRect.height - (bottom - editorDomRect.top);
      sheet.insertRule(`.${className}::before { height: ${topHeight > 0 ? topHeight : 0}px; }`, 0);
      sheet.insertRule(`.${className}::after { height: ${bottomHeight > 0 ? bottomHeight : 0}px; }`, 0);
    }
    if (writingStyle === 'typewriter') {
      const height = this.editor.getScrollInfo().clientHeight / 2;
      sheet.insertRule(`.${className} .CodeMirror-lines::before { height: ${height}px; }`, 0);
      sheet.insertRule(`.${className} .CodeMirror-lines::after { height: ${height}px; }`, 0);
      this.editor.scrollTo(null, this.editor.cursorCoords(null, 'local').top - height);
    }
  }

  /**
   * 修改书写风格
   */
  setWritingStyle(writingStyle) {
    this.options.writingStyle = writingStyle;
    this.initWritingStyle();
  }

  /**
   * 设置编辑器值
   */
  setValue(value = '') {
    this.editor.setOption('value', value);
  }
}
