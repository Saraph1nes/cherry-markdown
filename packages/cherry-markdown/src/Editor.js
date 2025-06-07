/**
 * Copyright (C) 2021 THL A29 Limited, a Tencent company.
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
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { searchKeymap, search, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { bracketMatching } from '@codemirror/language';

import htmlParser from '@/utils/htmlparser';
import pasteHelper from '@/utils/pasteHelper';
import { addEvent } from './utils/event';
import Logger from '@/Logger';
import { handleFileUploadCallback } from '@/utils/file';
import { createElement } from './utils/dom';
import { longTextReg, base64Reg, imgDrawioXmlReg } from './utils/regexp';
import { handleNewlineIndentList } from './utils/autoindent';

/**
 * @typedef {import('~types/editor').EditorConfiguration} EditorConfiguration
 * @typedef {import('~types/editor').EditorEventCallback} EditorEventCallback
 */

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
      id: 'code', // textarea 的id属性值
      name: 'code', // textarea 的name属性值
      autoSave2Textarea: false,
      editorDom: document.createElement('div'),
      wrapperDom: null,
      autoScrollByCursor: true,
      convertWhenPaste: true,
      keyMap: 'sublime',
      showFullWidthMark: true,
      showSuggestList: true,
      codemirror: {
        lineNumbers: false, // 显示行数
        cursorHeight: 0.85, // 光标高度，0.85好看一些
        indentUnit: 4, // 缩进单位为4
        tabSize: 4, // 一个tab转换成的空格数量
        lineWrapping: true, // 自动换行
        indentWithTabs: true, // 缩进用tab表示
        autofocus: true,
        theme: 'default',
        autoCloseTags: true, // 输入html标签时自动补充闭合标签
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

    // Initialize CodeMirror 6 editor state and view
    this.editorView = null;
    this.editorState = null;
    this.decorationCache = new Map();
  }

  /**
   * 禁用快捷键
   * @param {boolean} disable 是否禁用快捷键
   */
  disableShortcut = (disable = true) => {
    // TODO: Implement for CodeMirror 6
    // 在 CodeMirror 6 中需要通过重新配置扩展来实现
  };

  /**
   * 在onChange后处理draw.io的xml数据和图片的base64数据，对这种超大的数据增加省略号，
   * 以及对全角符号进行特殊染色。
   */
  dealSpecialWords = () => {
    /**
     * 如果编辑器隐藏了，则不再处理（否则有性能问题）
     */
    if (this.$cherry.status.editor === 'hide') {
      return;
    }
    this.formatBigData2Mark(base64Reg, 'cm-url base64');
    this.formatBigData2Mark(imgDrawioXmlReg, 'cm-url drawio');
    this.formatBigData2Mark(longTextReg, 'cm-url long-text');
    this.formatFullWidthMark();
  };

  /**
   * 把大字符串变成省略号
   * @param {RegExp} reg 正则
   * @param {string} className 利用codemirror的MarkText生成的新元素的class
   */
  formatBigData2Mark = (reg, className) => {
    const view = this.editorView;
    if (!view) return;

    const text = view.state.doc.toString();
    const decorations = [];

    let match;
    while ((match = reg.exec(text)) !== null) {
      const from = match.index + (match[1]?.length || 0);
      const to = from + (match[2]?.length || 0);

      const newSpan = createElement('span', `cm-string ${className}`, { title: match[2] || '' });
      newSpan.textContent = match[2] || '';

      decorations.push(
        Decoration.replace({
          widget: new (class extends WidgetType {
            toDOM() {
              return newSpan;
            }
          })(),
        }).range(from, to),
      );
    }

    // 应用装饰
    this.applyDecorations(decorations);
  };

  /**
   * 高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》
   * full width翻译为全角
   */
  formatFullWidthMark() {
    if (!this.options.showFullWidthMark) {
      return;
    }

    const view = this.editorView;
    if (!view) return;

    const text = view.state.doc.toString();
    const regex = /[·￥、：""【】（）《》]/g;
    const decorations = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      decorations.push(
        Decoration.mark({
          class: 'cm-fullWidth',
          attributes: {
            title: '按住Ctrl/Cmd点击切换成半角（Hold down Ctrl/Cmd and click to switch to half-width）',
          },
        }).range(match.index, match.index + 1),
      );
    }

    this.applyDecorations(decorations);
  }

  /**
   * 应用装饰到编辑器
   * @param {Array} decorations
   */
  applyDecorations(decorations) {
    if (!this.editorView) return;

    // CodeMirror 6 中装饰的应用方式不同，这里暂时注释掉
    // 需要实现一个完整的装饰系统
    // const decorationSet = Decoration.set(decorations.sort((a, b) => a.from - b.from));
  }

  /**
   * 处理全角转半角
   * @param {MouseEvent} evt
   */
  toHalfWidth(evt) {
    const { target } = evt;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // 针对windows用户为Ctrl按键，Mac用户为Cmd按键
    if (target.classList.contains('cm-fullWidth') && (evt.ctrlKey || evt.metaKey) && evt.buttons === 1) {
      const view = this.editorView;
      if (!view) return;

      // 获取点击位置的字符位置
      const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY });
      if (pos !== null) {
        const char = view.state.doc.sliceString(pos, pos + 1);
        const replacement = char
          .replace('·', '`')
          .replace('￥', '$')
          .replace('、', '/')
          .replace('：', ':')
          .replace('"', '"')
          .replace('"', '"')
          .replace('【', '[')
          .replace('】', ']')
          .replace('（', '(')
          .replace('）', ')')
          .replace('《', '<')
          .replace('》', '>');

        view.dispatch({
          changes: { from: pos, to: pos + 1, insert: replacement },
        });
      }
    }
  }

  /**
   * 处理按键事件
   * @param {KeyboardEvent} e
   */
  onKeyup = (e) => {
    const view = this.editorView;
    if (!view) return;

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    this.previewer.highlightLine(line.number);
  };

  /**
   * 处理粘贴事件
   * @param {ClipboardEvent} e
   */
  onPaste(e) {
    let { clipboardData } = e;
    if (clipboardData) {
      this.handlePaste(e, clipboardData);
    } else {
      ({ clipboardData } = window);
      this.handlePaste(e, clipboardData);
    }
  }

  /**
   * 处理粘贴逻辑
   * @param {ClipboardEvent} event
   * @param {ClipboardEvent['clipboardData']} clipboardData
   * @returns {boolean | void}
   */
  handlePaste(event, clipboardData) {
    const onPasteRet = this.$cherry.options.callback.onPaste(clipboardData, this.$cherry);
    if (onPasteRet !== false && typeof onPasteRet === 'string') {
      event.preventDefault();
      this.replaceSelection(onPasteRet);
      return;
    }

    let html = clipboardData.getData('Text/Html');
    const { items } = clipboardData;
    // 清空注释
    html = html.replace(/<!--[^>]+>/g, '');

    /**
     * 处理"右键复制图片"场景
     */
    if (
      /<body>\s*<img [^>]+>\s*<\/body>/.test(html) &&
      items[1]?.kind === 'file' &&
      items[1]?.type.match(/^image\//i)
    ) {
      html = '';
    }

    this.fileUploadCount = 0;
    // 处理文件上传
    for (let i = 0; !html && i < items.length; i++) {
      const item = items[i];
      // 判断是否为图片数据
      if (item && item.kind === 'file' && item.type.match(/^image\//i)) {
        // 读取该图片
        const file = item.getAsFile();
        this.$cherry.options.callback.fileUpload(file, (url, params = {}) => {
          this.fileUploadCount += 1;
          if (typeof url !== 'string') {
            return;
          }
          const mdStr = `${this.fileUploadCount > 1 ? '\n' : ''}${handleFileUploadCallback(url, params, file)}`;
          this.replaceSelection(mdStr);
        });
        event.preventDefault();
      }
    }

    // 复制html转换markdown
    const htmlText = clipboardData.getData('text/plain');
    if (!html || !this.options.convertWhenPaste) {
      return true;
    }

    let divObj = document.createElement('DIV');
    divObj.innerHTML = html;
    html = divObj.innerHTML;
    const mdText = htmlParser.run(html);
    if (typeof mdText === 'string' && mdText.trim().length > 0) {
      const view = this.editorView;
      if (view) {
        const selection = view.state.selection.main;
        const currentCursor = {
          line: view.state.doc.lineAt(selection.from).number - 1,
          ch: selection.from - view.state.doc.lineAt(selection.from).from,
        };
        this.replaceSelection(mdText);
        pasteHelper.showSwitchBtnAfterPasteHtml(this.$cherry, currentCursor, this, htmlText, mdText);
      }
      event.preventDefault();
    }
    divObj = null;
  }

  /**
   * 替换选中内容
   * @param {string} text
   */
  replaceSelection(text) {
    const view = this.editorView;
    if (!view) return;

    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      })),
    );
  }

  /**
   * 处理滚动事件
   */
  onScroll = () => {
    this.$cherry.$event.emit('cleanAllSubMenus');
    if (this.disableScrollListener) {
      this.disableScrollListener = false;
      return;
    }

    const view = this.editorView;
    if (!view) return;

    const { scrollTop, scrollHeight, clientHeight } = view.scrollDOM;

    if (scrollTop <= 0) {
      this.previewer.scrollToLineNum(0);
      return;
    }
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      this.previewer.scrollToLineNum(null); // 滚动到底
      return;
    }

    // 获取当前视口顶部的行号
    const viewportTop = view.scrollDOM.scrollTop;
    const topPos = view.posAtCoords({ x: 0, y: view.contentDOM.getBoundingClientRect().top + viewportTop });
    if (topPos !== null) {
      const line = view.state.doc.lineAt(topPos);
      const lineBlock = view.lineBlockAt(topPos);
      const lineHeight = view.defaultLineHeight;
      const percent = Math.max(0, (viewportTop - lineBlock.top) / lineHeight / 100);

      this.previewer.scrollToLineNum(line.number, percent);
    }
  };

  /**
   * 处理鼠标按下事件
   * @param {MouseEvent} evt
   */
  onMouseDown = (evt) => {
    this.$cherry.$event.emit('cleanAllSubMenus');
    const view = this.editorView;
    if (!view) return;

    const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (pos !== null) {
      const line = view.state.doc.lineAt(pos);
      const top = Math.abs(evt.clientY - view.scrollDOM.getBoundingClientRect().top);
      this.previewer.scrollToLineNumWithOffset(line.number, top);
    }

    this.toHalfWidth(evt);
  };

  /**
   * 光标变化事件
   */
  onCursorActivity = () => {
    this.refreshWritingStatus();
  };

  /**
   * 初始化编辑器
   * @param {*} previewer
   */
  init(previewer) {
    const textArea = this.options.editorDom.querySelector(`#${this.options.id}`);
    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('The specific element is not a textarea.');
    }

    this.previewer = previewer;
    this.disableScrollListener = false;

    // 创建 CodeMirror 6 扩展
    const extensions = [
      markdown(),
      lineNumbers(),
      keymap.of([...defaultKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
      search({ top: true }),
      autocompletion(),
      bracketMatching(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      EditorView.theme({
        '.cm-scroller': {
          overflow: 'auto',
          height: '100%',
        },
        '.cm-editor': {
          height: '100%',
        },
        '.cm-content': {
          minHeight: '100%',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.options.onChange(update, this);
          this.dealSpecialWords();
          if (this.options.autoSave2Textarea) {
            textArea.value = this.getValue();
          }
          // 触发 CodeMirror 5 兼容的 change 事件
          this._fireEvent('change', this.editorView, update);
        }
        if (update.selectionSet) {
          this.onCursorActivity();
          // 触发 CodeMirror 5 兼容的 cursorActivity 事件
          this._fireEvent('cursorActivity');
        }
      }),
      EditorView.domEventHandlers({
        keydown: (event) => {
          this.options.onKeydown(event, this);
          return false;
        },
        keyup: (event) => {
          this.onKeyup(event);
          return false;
        },
        paste: (event) => {
          this.options.onPaste.call(this, event);
          return false;
        },
        mousedown: (event) => {
          if (this.options.autoScrollByCursor) {
            setTimeout(() => {
              this.onMouseDown(event);
            });
          }
          return false;
        },
        drop: (event) => {
          const files = event.dataTransfer?.files || [];
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
                  const mdStr = handleFileUploadCallback(url, params, file);
                  const insertValue = i > 0 ? `\n${mdStr} ` : `${mdStr} `;
                  this.replaceSelection(insertValue);
                  this.dealSpecialWords();
                });
              }
            }, 50);
          }
          return false;
        },
        scroll: () => {
          this.options.onScroll();
          this.options.writingStyle === 'focus' && this.refreshWritingStatus();
          // 触发 CodeMirror 5 兼容的 scroll 事件
          this._fireEvent('scroll', this.editorView);
        },
        focus: (event) => {
          this.options.onFocus(event, this);
          this.$cherry.$event.emit('focus', { evt: event, cherry: this.$cherry });
          return false;
        },
        blur: (event) => {
          this.options.onBlur(event, this);
          this.$cherry.$event.emit('blur', { evt: event, cherry: this.$cherry });
          return false;
        },
      }),
    ];

    // 创建编辑器状态
    this.editorState = EditorState.create({
      doc: this.options.value || '',
      extensions,
    });

    // 创建编辑器视图
    this.editorView = new EditorView({
      state: this.editorState,
      parent: this.options.editorDom,
    });

    // 隐藏原始 textarea
    textArea.style.display = 'none';

    // 设置别名以保持兼容性
    this.editor = this.editorView;

    addEvent(
      this.editorView.scrollDOM,
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
        // CodeMirror 6 会自动处理大小调整
      }
    });
    resizeObserver.observe(this.getEditorDom());
  }

  /**
   * 跳转到指定行
   * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
   * @param {number} [endLine] 终止行
   * @param {number} [percent] 百分比，取值0~1
   */
  jumpToLine(beginLine, endLine, percent) {
    const view = this.editorView;
    if (!view) return;

    if (beginLine === null) {
      cancelAnimationFrame(this.animation.timer);
      this.disableScrollListener = true;
      const lastLine = view.state.doc.lines;
      const pos = view.state.doc.line(lastLine).to;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos),
      });
      this.animation.timer = 0;
      return;
    }

    const line = view.state.doc.line(Math.min(beginLine + 1, view.state.doc.lines));
    let pos = line.from;

    if (endLine && percent) {
      const endLineObj = view.state.doc.line(Math.min(beginLine + endLine + 1, view.state.doc.lines));
      const range = endLineObj.to - line.from;
      pos = line.from + Math.floor(range * percent);
    }

    const blockInfo = view.lineBlockAt(pos);
    const targetTop = blockInfo.top + blockInfo.height * (percent || 0);
    this.animation.destinationTop = Math.ceil(targetTop - 15);

    if (this.animation.timer) {
      return;
    }

    const animationHandler = () => {
      const currentTop = view.scrollDOM.scrollTop;
      const delta = this.animation.destinationTop - currentTop;
      const move = Math.ceil(Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) / (100 / 16.7))));

      if (delta > 0) {
        if (currentTop >= this.animation.destinationTop) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        view.scrollDOM.scrollTop = currentTop + move;
      } else if (delta < 0) {
        if (currentTop <= this.animation.destinationTop || currentTop <= 0) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        view.scrollDOM.scrollTop = currentTop - move;
      } else {
        this.animation.timer = 0;
        return;
      }

      const newScrollTop = view.scrollDOM.scrollTop;
      if (currentTop === newScrollTop || move >= Math.abs(delta)) {
        this.animation.timer = 0;
        return;
      }
      this.animation.timer = requestAnimationFrame(animationHandler);
    };
    this.animation.timer = requestAnimationFrame(animationHandler);
  }

  /**
   * 滚动到指定行号
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
   * 获取编辑器DOM
   * @returns {HTMLElement}
   */
  getEditorDom() {
    return this.options.editorDom;
  }

  /**
   * 添加事件监听器
   * @param {string} event 事件名
   * @param {EditorEventCallback} callback 回调函数
   */
  addListener(event, callback) {
    // CodeMirror 6 使用不同的事件系统
    // 这里需要根据具体事件类型来处理
    console.warn('addListener method needs to be implemented for CodeMirror 6');
  }

  /**
   * 初始化书写风格
   */
  initWritingStyle() {
    const { writingStyle } = this.options;
    const className = `cherry-editor-writing-style--${writingStyle}`;
    const editorDom = this.getEditorDom();
    // 重置状态
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

    const view = this.editorView;
    if (!view) return;

    if (writingStyle === 'focus') {
      const editorDomRect = this.getEditorDom().getBoundingClientRect();
      const selection = view.state.selection.main;
      const cursorCoords = view.coordsAtPos(selection.head);

      if (cursorCoords) {
        const topHeight = cursorCoords.top - editorDomRect.top;
        const bottomHeight = editorDomRect.height - (cursorCoords.bottom - editorDomRect.top);
        sheet.insertRule(`.${className}::before { height: ${topHeight > 0 ? topHeight : 0}px; }`, 0);
        sheet.insertRule(`.${className}::after { height: ${bottomHeight > 0 ? bottomHeight : 0}px; }`, 0);
      }
    }
    if (writingStyle === 'typewriter') {
      const height = view.scrollDOM.clientHeight / 2;
      sheet.insertRule(`.${className} .cm-content::before { height: ${height}px; content: ''; display: block; }`, 0);
      sheet.insertRule(`.${className} .cm-content::after { height: ${height}px; content: ''; display: block; }`, 0);

      const selection = view.state.selection.main;
      const cursorCoords = view.coordsAtPos(selection.head);
      if (cursorCoords) {
        view.scrollDOM.scrollTop = cursorCoords.top - height;
      }
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
    const view = this.editorView;
    if (!view) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }

  /**
   * 获取编辑器值
   */
  getValue() {
    const view = this.editorView;
    if (!view) return '';
    return view.state.doc.toString();
  }

  // CodeMirror 5 兼容性方法
  getCursor() {
    const view = this.editorView;
    if (!view) return { line: 0, ch: 0 };

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return { line: line.number - 1, ch: pos - line.from };
  }

  setCursor(line, ch = 0) {
    const view = this.editorView;
    if (!view) return;

    const pos = view.state.doc.line(line + 1).from + ch;
    view.dispatch({
      selection: { anchor: pos },
    });
  }

  getLine(lineNum) {
    const view = this.editorView;
    if (!view) return '';

    const line = view.state.doc.line(lineNum + 1);
    return line.text;
  }

  getSelection() {
    const view = this.editorView;
    if (!view) return '';

    const selection = view.state.selection.main;
    return view.state.doc.sliceString(selection.from, selection.to);
  }

  setSelection(anchor, head = null) {
    const view = this.editorView;
    if (!view) return;

    let anchorPos, headPos;

    if (typeof anchor === 'object' && anchor.line !== undefined) {
      const anchorLine = view.state.doc.line(anchor.line + 1);
      anchorPos = anchorLine.from + anchor.ch;
    } else {
      anchorPos = anchor;
    }

    if (head === null) {
      headPos = anchorPos;
    } else if (typeof head === 'object' && head.line !== undefined) {
      const headLine = view.state.doc.line(head.line + 1);
      headPos = headLine.from + head.ch;
    } else {
      headPos = head;
    }

    view.dispatch({
      selection: { anchor: anchorPos, head: headPos },
    });
  }

  replaceSelections(replacements, select = 'end') {
    const view = this.editorView;
    if (!view) return;

    const ranges = view.state.selection.ranges;
    if (ranges.length !== replacements.length) return;

    const changes = ranges.map((range, i) => ({
      from: range.from,
      to: range.to,
      insert: replacements[i],
    }));

    view.dispatch({
      changes,
      selection:
        select === 'around'
          ? view.state.selection
          : EditorSelection.create(changes.map((change) => EditorSelection.cursor(change.from + change.insert.length))),
    });
  }

  getDoc() {
    const view = this.editorView;
    if (!view) return null;

    return {
      indexFromPos: (pos) => {
        const line = view.state.doc.line(pos.line + 1);
        return line.from + pos.ch;
      },
      posFromIndex: (index) => {
        const line = view.state.doc.lineAt(index);
        return { line: line.number - 1, ch: index - line.from };
      },
    };
  }

  findWordAt(pos) {
    const view = this.editorView;
    if (!view) return { anchor: pos, head: pos };

    const docPos =
      typeof pos === 'object' && pos.line !== undefined ? view.state.doc.line(pos.line + 1).from + pos.ch : pos;

    const line = view.state.doc.lineAt(docPos);
    const text = line.text;
    const offset = docPos - line.from;

    // 简单的单词边界检测
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1])) start -= 1;
    while (end < text.length && /\w/.test(text[end])) end += 1;

    const startPos = { line: line.number - 1, ch: start };
    const endPos = { line: line.number - 1, ch: end };

    return { anchor: startPos, head: endPos };
  }

  getOption(option) {
    // 返回默认值以保持兼容性
    switch (option) {
      case 'extraKeys':
        return this._extraKeys || {};
      default:
        return undefined;
    }
  }

  setOption(option, value) {
    switch (option) {
      case 'extraKeys':
        this._extraKeys = value;
        // 在 CodeMirror 6 中需要重新配置 keymap
        break;
    }
  }

  on(event, callback) {
    // 将事件监听器存储起来，以便后续使用
    if (!this._eventListeners) {
      this._eventListeners = new Map();
    }

    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }

    this._eventListeners.get(event).push(callback);

    // 根据事件类型设置对应的处理
    switch (event) {
      case 'change':
        // change 事件已经在 EditorView.updateListener 中处理
        break;
      case 'cursorActivity':
        // cursorActivity 事件已经在 EditorView.updateListener 中处理
        break;
      case 'scroll':
        // scroll 事件已经在 domEventHandlers 中处理
        break;
      case 'keydown':
        // keydown 事件已经在 domEventHandlers 中处理
        break;
    }
  }

  // 触发事件的辅助方法
  _fireEvent(event, ...args) {
    if (this._eventListeners && this._eventListeners.has(event)) {
      this._eventListeners.get(event).forEach((callback) => {
        callback(...args);
      });
    }
  }

  focus() {
    const view = this.editorView;
    if (view) {
      view.focus();
    }
  }

  scrollIntoView(pos) {
    const view = this.editorView;
    if (!view) return;

    if (pos === null) {
      // 滚动到当前光标位置
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head),
      });
    } else if (typeof pos === 'object' && pos.line !== undefined) {
      const line = view.state.doc.line(pos.line + 1);
      const docPos = line.from + (pos.ch || 0);
      view.dispatch({
        effects: EditorView.scrollIntoView(docPos),
      });
    }
  }
}
