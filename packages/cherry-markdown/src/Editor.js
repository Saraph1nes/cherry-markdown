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
import { EditorState, EditorSelection, Transaction } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import htmlParser from '@/utils/htmlparser';
import pasteHelper from '@/utils/pasteHelper';
import Logger from '@/Logger';
import { handleFileUploadCallback } from '@/utils/file';
import { tags } from '@lezer/highlight';
import { createElement } from './utils/dom';
import { longTextReg, base64Reg, imgDrawioXmlReg, createUrlReg } from './utils/regexp';
import { handleNewlineIndentList } from './utils/autoindent';

/**
 * @typedef {import('~types/editor').EditorConfiguration} EditorConfiguration
 * @typedef {import('~types/editor').EditorEventCallback} EditorEventCallback
 * @typedef {import('codemirror')} CodeMirror
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
        // styleActiveLine: false, // 当前行背景高亮
        // matchBrackets: true, // 括号匹配
        // mode: 'gfm', // 从markdown模式改成gfm模式，以使用默认高亮规则
        mode: {
          name: 'yaml-frontmatter', // yaml-frontmatter在gfm的基础上增加了对yaml的支持
          base: {
            name: 'gfm',
            gitHubSpice: false, // 修复github风格的markdown语法高亮，见[issue#925](https://github.com/Tencent/cherry-markdown/issues/925)
          },
        },
        lineWrapping: true, // 自动换行
        indentWithTabs: true, // 缩进用tab表示
        autofocus: true,
        theme: 'default',
        autoCloseTags: true, // 输入html标签时自动补充闭合标签
        extraKeys: {
          Enter: handleNewlineIndentList,
        }, // 增加markdown回车自动补全
        matchTags: { bothTags: true }, // 自动高亮选中的闭合html标签
        placeholder: '',
        // 设置为 contenteditable 对输入法定位更友好
        // 但已知会影响某些悬浮菜单的定位，如粘贴选择文本或markdown模式的菜单
        // inputStyle: 'contenteditable',
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
    /** @type {EditorView | null} */
    this.editor = null;

    // 添加缺失的属性
    this.animation = {
      timer: 0,
      destinationTop: 0,
    };
    this.disableScrollListener = false;

    const { codemirror, ...restOptions } = options;
    if (codemirror) {
      Object.assign(this.options.codemirror, codemirror);
    }
    Object.assign(this.options, restOptions);
    this.options.codemirror.keyMap = this.options.keyMap;
    this.$cherry = this.options.$cherry;
  }

  refresh() {
    if (this.editor) {
      this.editor.requestMeasure();
    }
  }

  /**
   * 禁用快捷键
   * @param {boolean} disable 是否禁用快捷键
   */
  disableShortcut = (disable = true) => {
    // CodeMirror 6 中快捷键通过 keymap 扩展管理
    // 这里需要重新配置编辑器的 keymap
    console.warn('disableShortcut needs to be reimplemented for CodeMirror 6');
  };

  /**
   * 在onChange后处理draw.io的xml数据和图片的base64数据，对这种超大的数据增加省略号，
   * 以及对全角符号进行特殊染色。
   */
  dealSpecialWords = () => {
    /**
     * 如果编辑器隐藏了，则不再处理（否则有性能问题）
     * - 性能问题出现的原因：
     *  1. 纯预览模式下，cherry的高度可能会被设置成auto（也就是没有滚动条）
     *  2. 这时候codemirror的高度也是auto，其"视窗懒加载"提升性能的手段就失效了
     *  3. 这时再大量的调用markText等api就会非常耗时
     * - 经过上述分析，最好的判断应该是判断**编辑器高度是否为auto**，但考虑到一般只有纯预览模式才大概率设置成auto，所以就只判断纯预览模式了
     */
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
    // CodeMirror 6 中需要使用 SearchCursor 和 Decoration 来实现
    // 这里需要重新实现标记功能
    console.warn('formatBigData2Mark needs to be reimplemented for CodeMirror 6');
  };

  /**
   * 高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》
   * full width翻译为全角
   */
  formatFullWidthMark() {
    if (!this.options.showFullWidthMark) {
      return;
    }
    // CodeMirror 6 中需要使用 Decoration 来实现标记功能
    // 这里需要重新实现全角符号标记
    console.warn('formatFullWidthMark needs to be reimplemented for CodeMirror 6');
  }

  /**
   *
   * @param {CodeMirror.Editor} codemirror
   * @param {MouseEvent} evt
   */
  /**
   * 将全角符号转换为半角符号
   * @param {EditorView} editorView - 编辑器实例
   * @param {MouseEvent} evt - 鼠标事件对象
   */
  toHalfWidth(editorView, evt) {
    const { target } = evt;
    // 判断事件目标是否为HTMLElement，防止类型错误
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // 仅在点击了带有"cm-fullWidth"类名的元素，并且按下了Ctrl（Windows）或Cmd（Mac）键且为鼠标左键时触发
    if (target.classList.contains('cm-fullWidth') && (evt.ctrlKey || evt.metaKey) && evt.buttons === 1) {
      // 获取目标字符的位置信息
      const rect = target.getBoundingClientRect();
      // 由于是单个字符，肯定在同一行，获取字符在编辑器中的起止位置
      // 使用CodeMirror 6的API获取点击字符的文档位置
      const editorRect = editorView.scrollDOM.getBoundingClientRect();
      const x = rect.left - editorRect.left;
      const y = rect.top - editorRect.top;
      // 通过editorView.posAtCoords获取文档位置
      const fromPos = editorView.posAtCoords({ x, y });
      if (fromPos === null) return;
      const line = editorView.state.doc.lineAt(fromPos);
      const from = { line: line.number - 1, ch: fromPos - line.from };
      const to = { line: from.line, ch: from.ch + 1 };
      // 选中该字符
      const selection = EditorSelection.range(
        editorView.state.doc.line(from.line + 1).from + from.ch,
        editorView.state.doc.line(to.line + 1).from + to.ch,
      );
      editorView.dispatch({
        selection,
        scrollIntoView: true,
      });
      // 替换为对应的半角符号
      // 使用CodeMirror 6的dispatch方法替换选中文本
      const replacementText = target.innerText
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

      editorView.dispatch({
        changes: {
          from: editorView.state.selection.main.from,
          to: editorView.state.selection.main.to,
          insert: replacementText,
        },
        selection: { anchor: editorView.state.selection.main.from + replacementText.length },
        scrollIntoView: true,
      });
    }
  }
  /**
   *
   * @param {KeyboardEvent} e
   * @param {EditorView} editorView
   */
  /**
   * 处理键盘弹起事件（keyup），用于高亮预览区对应的行
   * @param {KeyboardEvent} e - 键盘事件对象
   * @param {EditorView} editorView - CodeMirror 6 编辑器实例
   */
  onKeyup = (e, editorView) => {
    // 获取当前主选区的起始位置
    const pos = editorView.state.selection.main.head;
    // 获取当前行号（CodeMirror 6的lineAt返回的number为1起始）
    const line = editorView.state.doc.lineAt(pos).number;
    // 高亮预览区对应的行（行号从1开始）
    this.previewer.highlightLine(line);
  };

  /**
   *
   * @param {ClipboardEvent} e
   * @param {EditorView} editorView
   */
  onPaste(e, editorView) {
    let { clipboardData } = e;
    if (clipboardData) {
      this.handlePaste(e, clipboardData, editorView);
    } else {
      ({ clipboardData } = window);
      this.handlePaste(e, clipboardData, editorView);
    }
  }

  /**
   *
   * @param {ClipboardEvent} event
   * @param {ClipboardEvent['clipboardData']} clipboardData
   * @param {EditorView} editorView
   * @returns {boolean | void}
   */
  handlePaste(event, clipboardData, editorView) {
    const onPasteRet = this.$cherry.options.callback.onPaste(clipboardData, this.$cherry);
    if (onPasteRet !== false && typeof onPasteRet === 'string') {
      event.preventDefault();
      // 使用 CodeMirror 6 API 替换选中内容
      editorView.dispatch({
        changes: {
          from: editorView.state.selection.main.from,
          to: editorView.state.selection.main.to,
          insert: onPasteRet,
        },
      });
      return;
    }
    let html = clipboardData.getData('Text/Html');
    const { items } = clipboardData;

    // 优先处理来自 Word 等应用的粘贴内容
    // 有效的内容通常由 StartFragment 和 EndFragment 标记包裹。
    html = html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');

    // 删除其他无关的注释
    html = html.replace(/<!--[^>]+>/g, '');
    /**
     * 处理"右键复制图片"场景
     * 在这种场景下，我们希望粘贴进来的图片可以走文件上传逻辑，所以当检测到这种场景后，我们会清空html
     */
    if (
      /<body>\s*<img [^>]+>\s*<\/body>/.test(html) &&
      items[1]?.kind === 'file' &&
      items[1]?.type.match(/^image\//i)
    ) {
      html = '';
    }

    this.fileUploadCount = 0;
    // 只要有html内容，就不处理剪切板里的其他内容，这么做的后果是粘贴excel内容时，只会粘贴html内容，不会把excel对应的截图粘进来
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
          // 使用 CodeMirror 6 API 插入内容
          editorView.dispatch({
            changes: {
              from: editorView.state.selection.main.from,
              to: editorView.state.selection.main.to,
              insert: mdStr,
            },
          });
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
      const selection = editorView.state.selection.main;
      const currentCursor = {
        line: editorView.state.doc.lineAt(selection.from).number - 1,
        ch: selection.from - editorView.state.doc.lineAt(selection.from).from,
      };

      // 使用 CodeMirror 6 API 替换选中内容
      editorView.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: mdText,
        },
      });

      pasteHelper.showSwitchBtnAfterPasteHtml(this.$cherry, currentCursor, editorView, htmlText, mdText);
      event.preventDefault();
    }
    divObj = null;
  }

  /**
   *
   * @param {EditorView} editorView
   */
  onScroll = (editorView) => {
    this.$cherry.$event.emit('cleanAllSubMenus'); // 滚动时清除所有子菜单，这不应该在Bubble中处理，我们关注的是编辑器的滚动  add by ufec
    if (this.disableScrollListener) {
      this.disableScrollListener = false;
      return;
    }
    const scroller = editorView.scrollDOM;
    if (scroller.scrollTop <= 0) {
      this.previewer.scrollToLineNum(0);
      return;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 20) {
      this.previewer.scrollToLineNum(null); // 滚动到底
      return;
    }
    const currentTop = scroller.scrollTop;
    const targetLineBlock = editorView.lineBlockAtHeight(currentTop);
    const targetLine = editorView.state.doc.lineAt(targetLineBlock.from).number - 1; // CM6中行号从1开始，转换为0
    //
    const lineHeight = targetLineBlock.height;
    const lineTop = targetLineBlock.top;
    const percent = (100 * (currentTop - lineTop)) / lineHeight / 100;
    // console.log(percent);
    // codemirror中行号以0开始，所以需要+1
    this.previewer.scrollToLineNum(targetLine + 1, percent);
  };

  /**
   *
   * @param {EditorView} editorView - 当前的CodeMirror实例
   * @param {MouseEvent} evt
   */
  onMouseDown = (editorView, evt) => {
    // 鼠标按下时，清除所有子菜单（如Bubble工具栏等），
    this.$cherry.$event.emit('cleanAllSubMenus'); // Bubble中处理需要考虑太多，直接在编辑器中处理可包括Bubble中所有情况，因为产生Bubble的前提是光标在编辑器中 add by ufec
    const clickPos = editorView.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (clickPos === null) {
      return;
    }
    const line = editorView.state.doc.lineAt(clickPos);
    const targetLine = line.number - 1;
    const top = Math.abs(evt.y - editorView.scrollDOM.getBoundingClientRect().y);
    this.previewer.scrollToLineNumWithOffset(targetLine + 1, top);
    this.toHalfWidth(editorView, evt);
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
    this.previewer = previewer;

    const highlightStyle = HighlightStyle.define([
      { tag: tags.heading1, class: 'cm-header header-h1' },
      { tag: tags.heading2, class: 'cm-header header-h2' },
      { tag: tags.heading3, class: 'cm-header header-h3' },
      { tag: tags.heading4, class: 'cm-header header-h4' },
      { tag: tags.heading5, class: 'cm-header header-h5' },
      { tag: tags.heading6, class: 'cm-header header-h6' },
      { tag: tags.url, class: 'cm-url' },
      { tag: tags.link, class: 'cm-link' },
      { tag: tags.quote, class: 'cm-quote' },
      { tag: tags.string, class: 'cm-string' },
      { tag: tags.emphasis, class: 'cm-em' },
      { tag: tags.strong, class: 'cm-strong' },
      { tag: tags.strikethrough, class: 'cm-strikethrough' },
      { tag: tags.comment, class: 'cm-comment' },
      { tag: tags.content, class: 'cm-variable-2' },
      { tag: tags.typeName, class: 'cm-type' },
    ]);

    const extensions = [
      // lineNumbers({}), // 显示行号
      EditorState.allowMultipleSelections.of(true), // 允许同时选中多个区域
      EditorView.lineWrapping, // 自动换行
      markdown(), // 代码高亮
      // syntaxHighlighting(defaultHighlightStyle),
      syntaxHighlighting(highlightStyle),
      // Event listeners
      EditorView.updateListener.of((update) => {
        if (!this.editor) return;
        if (update.docChanged) {
          this.$cherry.$event.emit('onChange');
          this.options.onChange(update, this.editor);
        }
        if (update.focusChanged) {
          if (this.editor.hasFocus) {
            this.options.onFocus(update, this.editor);
          } else {
            this.options.onBlur(update, this.editor);
          }
        }
        if (update.selectionSet) {
          // 检查是否有用户交互
          const isUserInteraction = update.transactions.some((tr) => tr.annotation(Transaction.userEvent));

          // 检查具体的用户事件类型
          const userEvents = update.transactions.map((tr) => tr.annotation(Transaction.userEvent)).filter(Boolean);

          // 处理选择变化
          const selection = update.state.selection.main;
          this.$cherry.$event.emit('beforeSelectionChange', { selection, isUserInteraction, userEvents });
        }
      }),

      EditorView.domEventHandlers({
        paste: (event, view) => {
          this.onPaste(event, view);
        },
        scroll: (event, view) => {
          this.$cherry.$event.emit('onScroll');
          this.onScroll(view);
        },
        mousedown: (event, view) => {
          this.onMouseDown(view, event);
        },
        drop: (event, view) => {
          // handle drop
          console.log('drop event', event);
        },
        keyup: (event, view) => {
          this.onKeyup(event, view);
        },
      }),
    ];

    const state = EditorState.create({
      doc: this.options.value || '',
      extensions,
    });
    const parent = this.options.editorDom;

    this.editor = new EditorView({
      state,
      parent,
    });

    if (this.options.codemirror.autofocus) {
      this.editor.focus();
    }
  }

  /**
   *
   * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
   * @param {number} [endLine] 终止行
   * @param {number} [percent] 百分比，取值0~1
   */
  jumpToLine(beginLine, endLine = 0, percent = 0) {
    if (!this.editor) return;
    if (beginLine === null) {
      cancelAnimationFrame(this.animation.timer);
      this.disableScrollListener = true;
      const doc = this.editor.state.doc;
      const lastLinePos = doc.length;
      this.editor.dispatch({
        effects: EditorView.scrollIntoView(lastLinePos, { y: 'end' }),
      });
      this.animation.timer = 0;
      return;
    }
    const doc = this.editor.state.doc;
    const targetLineNumber = Math.min(beginLine + 1, doc.lines);
    const targetLine = doc.line(targetLineNumber);
    const endLineNumber = Math.min(beginLine + endLine + 1, doc.lines);
    const endLineObj = doc.line(endLineNumber);

    const targetLineBlock = this.editor.lineBlockAt(targetLine.from);
    const endLineBlock = this.editor.lineBlockAt(endLineObj.from);

    const height = endLineBlock.top - targetLineBlock.top;
    const targetTop = targetLineBlock.top + height * percent;

    this.animation.destinationTop = Math.ceil(targetTop - 15);

    if (this.animation.timer) {
      return;
    }

    const animationHandler = () => {
      const currentTop = this.editor.scrollDOM.scrollTop;
      const delta = this.animation.destinationTop - currentTop;
      // 100毫秒内完成动画
      const move = Math.ceil(Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) / (100 / 16.7))));
      // console.log('should scroll: ', move, delta, currentTop, this.animation.destinationTop);
      if (delta > 0) {
        if (currentTop >= this.animation.destinationTop) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollDOM.scrollTop = currentTop + move;
      } else if (delta < 0) {
        if (currentTop <= this.animation.destinationTop || currentTop <= 0) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        this.editor.scrollDOM.scrollTop = currentTop - move;
      } else {
        this.animation.timer = 0;
        return;
      }

      // 如果无法再继续滚动，或已到达目标，停止动画
      if (currentTop === this.editor.scrollDOM.scrollTop || move >= Math.abs(delta)) {
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
    // TODO: CodeMirror 6 需要重新配置键盘映射
    // this.editor.on(event, callback);
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

    if (writingStyle === 'focus') {
      const editorDomRect = this.getEditorDom().getBoundingClientRect();
      // CodeMirror 6 中需要重新实现光标位置获取
      // 这里需要使用新的 API 来获取光标坐标
      console.warn('Focus writing style needs to be reimplemented for CodeMirror 6');
      // 临时使用固定值
      const topHeight = 100;
      const bottomHeight = 100;
      sheet.insertRule(`.${className}::before { height: ${topHeight > 0 ? topHeight : 0}px; }`, 0);
      sheet.insertRule(`.${className}::after { height: ${bottomHeight > 0 ? bottomHeight : 0}px; }`, 0);
    }

    if (writingStyle === 'typewriter') {
      // 编辑器顶/底部填充的空白高度 (用于内容不足时使光标所在行滚动到编辑器中央)
      const height = this.editor.scrollDOM.clientHeight / 2;
      sheet.insertRule(`.${className} .cm-editor .cm-scroller::before { height: ${height}px; }`, 0);
      sheet.insertRule(`.${className} .cm-editor .cm-scroller::after { height: ${height}px; }`, 0);
      // CodeMirror 6 中的滚动方式
      this.editor.scrollDOM.scrollTop = height;
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
    if (this.editor) {
      this.editor.dispatch({
        changes: {
          from: 0,
          to: this.editor.state.doc.length,
          insert: value,
        },
      });
    }
  }

  /**
   * 获取编辑器值
   */
  getValue() {
    return this.editor ? this.editor.state.doc.toString() : '';
  }

  /**
   * 替换选中的文本
   */
  replaceSelections(text = []) {
    if (!this.editor) return;
    const selection = this.editor.state.selection.ranges;

    // 如果只有一个替换文本，应用到所有选区
    if (typeof text === 'string') {
      const changes = selection.map((range) => ({
        from: range.from,
        to: range.to,
        insert: text,
      }));
      this.editor.dispatch({ changes });
      return;
    }

    // 如果是数组，按顺序替换对应的选区
    const changes = selection.map((range, index) => ({
      from: range.from,
      to: range.to,
      insert: text[index] || '', // 如果数组长度不够，用空字符串
    }));

    this.editor.dispatch({ changes });
  }

  /**
   * 获取光标位置
   */
  getCursor() {
    if (!this.editor) return { line: 0, ch: 0 };
    const pos = this.editor.state.selection.main.head;
    const line = this.editor.state.doc.lineAt(pos);
    return {
      line: line.number - 1, // 转换为 0 开始的行号
      ch: pos - line.from,
    };
  }

  /**
   * 设置光标位置
   */
  setCursor(line, ch) {
    if (!this.editor) return;
    const doc = this.editor.state.doc;
    const targetLine = doc.line(line + 1); // 转换为 1 开始的行号
    const pos = targetLine.from + ch;
    this.editor.dispatch({
      selection: { anchor: pos, head: pos },
    });
  }

  /**
   * 聚焦编辑器
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }

  /**
   * 获取选中的文本
   * @returns {string[]}
   */
  getSelections() {
    if (!this.editor) return [];
    const selections = this.editor.state.selection.ranges.map((range) =>
      this.editor.state.doc.sliceString(range.from, range.to),
    );
    return selections;
  }
}
