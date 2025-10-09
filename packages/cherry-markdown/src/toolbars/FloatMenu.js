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
import Toolbar from './Toolbar';
/**
 * 当光标处于编辑器新行起始位置时出现的浮动工具栏
 */
export default class FloatMenu extends Toolbar {
  // constructor(options) {
  //     super(options);
  // }

  init() {
    this.editor = this.$cherry.editor;
    this.editorDom = this.editor.getEditorDom();
    this.editorDom.querySelector('.cm-scroller').appendChild(this.options.dom);
    this.initAction();
    Object.entries(this.shortcutKeyMap).forEach(([key, value]) => {
      this.$cherry.toolbar.shortcutKeyMap[key] = value;
    });
  }

  appendMenusToDom(menus) {
    this.options.dom.appendChild(menus);
  }

  initAction() {
    console.log('initAction this.editor', this.editor);

    // 监听选区变化事件
    this.$cherry.$event.on('selectionChange', (event) => {
      this.handleSelectionChange(event);
    });

    // 监听编辑器内容变化事件
    this.$cherry.$event.on('onChange', () => {
      this.handleContentChange();
    });

    // 监听清理子菜单事件
    this.$cherry.$event.on('cleanAllSubMenus', () => {
      this.hideFloatMenu();
    });

    // 监听编辑器滚动事件
    this.$cherry.$event.on('onScroll', () => {
      this.hideFloatMenu();
    });

    // 监听beforeSelectionChange事件（这个事件在Editor.js中已经触发）
    this.$cherry.$event.on('beforeSelectionChange', ({ selection }) => {
      this.handleBeforeSelectionChange(selection);
    });
  }

  /**
   * 处理选区变化
   * @param {Object} event 选区变化事件
   */
  handleSelectionChange(event) {
    if (this.editor && this.editor.editor) {
      const selection = this.editor.editor.state.selection.main;
      const line = this.editor.editor.state.doc.lineAt(selection.head);
      const pos = { line: line.number - 1 };

      // 创建兼容的 CodeMirror 对象
      const compatCodeMirror = this.createCompatCodeMirror();
      this.cursorActivity(null, compatCodeMirror);
    }
  }

  /**
   * 处理内容变化
   */
  handleContentChange() {
    if (this.editor && this.editor.editor) {
      const compatCodeMirror = this.createCompatCodeMirror();
      this.cursorActivity(null, compatCodeMirror);
    }
  }

  /**
   * 处理beforeSelectionChange事件
   * @param {Object} selection 选区对象
   */
  handleBeforeSelectionChange({ selection }) {
    if (this.editor && this.editor.editor) {
      const compatCodeMirror = this.createCompatCodeMirror();
      this.cursorActivity(null, compatCodeMirror);
    }
  }

  /**
   * 创建兼容的 CodeMirror 对象
   * @returns {Object} 兼容的 CodeMirror 对象
   */
  createCompatCodeMirror() {
    if (!this.editor || !this.editor.editor) {
      return null;
    }

    const editorView = this.editor.editor;
    const state = editorView.state;
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);

    return {
      getCursor: () => ({ line: line.number - 1 }),
      getLine: (lineNum) => {
        try {
          return state.doc.line(lineNum + 1).text;
        } catch (e) {
          return '';
        }
      },
      getSelections: () => {
        return state.selection.ranges.map((range) => state.doc.sliceString(range.from, range.to));
      },
      getSelection: () => {
        return state.doc.sliceString(selection.from, selection.to);
      },
      getDoc: () => ({
        eachLine: (start, end, callback) => {
          for (let i = start; i < end && i < state.doc.lines; i++) {
            try {
              const docLine = state.doc.line(i + 1);
              // 尝试使用 coordsAtPos 获取更精确的行高
              let lineHeight = 20; // 默认行高
              try {
                const startCoords = editorView.coordsAtPos(docLine.from);
                const endCoords = editorView.coordsAtPos(docLine.to);
                if (startCoords && endCoords) {
                  lineHeight = Math.max(startCoords.bottom - startCoords.top, 20);
                }
              } catch (coordsError) {
                // 如果 coordsAtPos 失败，使用默认行高
                console.warn('Failed to get coords for line height:', coordsError);
              }
              callback({ height: lineHeight });
            } catch (e) {
              break;
            }
          }
        },
      }),
      // 添加对 coordsAtPos 的支持
      coordsAtPos: (pos) => {
        try {
          return editorView.coordsAtPos(pos);
        } catch (e) {
          return null;
        }
      },
    };
  }

  /**
   * 隐藏浮动菜单
   */
  hideFloatMenu() {
    if (this.options.dom) {
      this.options.dom.style.display = 'none';
    }
  }

  /**
   * 清理事件监听器
   */
  destroy() {
    // 移除 Cherry 事件监听
    this.$cherry.$event.off('selectionChange', this.handleSelectionChange);
    this.$cherry.$event.off('onChange', this.handleContentChange);
    this.$cherry.$event.off('cleanAllSubMenus', this.hideFloatMenu);
    this.$cherry.$event.off('onScroll', this.hideFloatMenu);
    this.$cherry.$event.off('beforeSelectionChange', this.handleBeforeSelectionChange);
  }

  update(evt, codeMirror) {
    const pos = codeMirror.getCursor();
    if (this.isHidden(pos.line, codeMirror)) {
      this.options.dom.style.display = 'none';
      return false;
    }
    this.options.dom.style.display = 'inline-block';
  }

  /**
   * 当光标激活时触发，当光标处于行起始位置时展示float工具栏；反之隐藏
   * @param {Event} evt
   * @param {CodeMirror.Editor} codeMirror
   * @returns
   */
  cursorActivity(evt, codeMirror) {
    const pos = codeMirror.getCursor();
    const codeMirrorLines = document.querySelector('.cherry-editor .cm-editor');
    if (!codeMirrorLines) {
      return false;
    }

    if (this.isHidden(pos.line, codeMirror)) {
      this.options.dom.style.display = 'none';
      return false;
    }

    this.options.dom.style.display = 'inline-block';

    // 使用更精确的位置计算方法，参考 Bubble.js 的实现
    this.calculateFloatMenuPosition(pos, codeMirror, codeMirrorLines);
  }

  /**
   * 计算浮动菜单的精确位置
   * @param {Object} pos 光标位置对象
   * @param {Object} codeMirror 兼容的 CodeMirror 对象
   * @param {HTMLElement} codeMirrorLines 编辑器 DOM 元素
   */
  calculateFloatMenuPosition(pos, codeMirror, codeMirrorLines) {
    try {
      const editorView = this.editor.editor;
      if (!editorView) {
        return;
      }

      // 获取当前行的起始位置
      const lineStart = editorView.state.doc.line(pos.line + 1).from;

      // 使用 coordsAtPos 获取精确坐标
      const coords = editorView.coordsAtPos(lineStart);
      if (!coords) {
        return;
      }

      // 获取编辑器容器位置
      const editorPosition = this.editorDom.getBoundingClientRect();

      // 计算相对于编辑器的位置
      const top = coords.top - editorPosition.top;
      let left = coords.left - editorPosition.left;

      // 获取编辑器样式
      const computedLinesStyle = getComputedStyle(codeMirrorLines);
      const parsedPaddingLeft = Number.parseFloat(computedLinesStyle.paddingLeft);
      const parsedPaddingTop = Number.parseFloat(computedLinesStyle.paddingTop);
      const codeWrapPaddingLeft = Number.isFinite(parsedPaddingLeft) ? parsedPaddingLeft : 0;
      const codeWrapPaddingTop = Number.isFinite(parsedPaddingTop) ? parsedPaddingTop : 0;

      // 处理 placeholder 的情况
      const placeholderEl = codeMirrorLines.querySelector('.CodeMirror-placeholder');
      if (placeholderEl instanceof HTMLElement && placeholderEl.offsetParent !== null) {
        const linesRect = codeMirrorLines.getBoundingClientRect();
        const textNode = Array.from(placeholderEl.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue && n.nodeValue.trim() !== '',
        );

        if (textNode) {
          const range = document.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, textNode.nodeValue.length);
          const rects = range.getClientRects();
          const lastRect = rects[rects.length - 1];
          const placeholderRightRelative = Math.max(0, lastRect.right - linesRect.left);
          left = placeholderRightRelative - 80; // 调整偏移量
        }
      } else {
        // 没有 placeholder 时，使用默认的左边距
        left = codeWrapPaddingLeft;
      }

      // 设置位置
      this.options.dom.style.left = `${left}px`;
      this.options.dom.style.top = `${top + codeWrapPaddingTop}px`;
    } catch (error) {
      console.warn('Error calculating float menu position:', error);
      // 降级到原有的计算方式
      this.fallbackPositionCalculation(pos, codeMirror, codeMirrorLines);
    }
  }

  /**
   * 降级的位置计算方法（保留原有逻辑作为备用）
   * @param {Object} pos 光标位置对象
   * @param {Object} codeMirror 兼容的 CodeMirror 对象
   * @param {HTMLElement} codeMirrorLines 编辑器 DOM 元素
   */
  fallbackPositionCalculation(pos, codeMirror, codeMirrorLines) {
    const computedLinesStyle = getComputedStyle(codeMirrorLines);
    const parsedPaddingLeft = Number.parseFloat(computedLinesStyle.paddingLeft);
    const parsedPaddingTop = Number.parseFloat(computedLinesStyle.paddingTop);
    const codeWrapPaddingLeft = Number.isFinite(parsedPaddingLeft) ? parsedPaddingLeft : 0;
    const codeWrapPaddingTop = Number.isFinite(parsedPaddingTop) ? parsedPaddingTop : 0;

    this.options.dom.style.left = `${codeWrapPaddingLeft}px`;

    // 当配置 codemirror.placeholder 时，测量 placeholder 中文本的范围
    // 将浮动工具栏定位到 placeholder 文本后面
    const placeholderEl = codeMirrorLines.querySelector('.CodeMirror-placeholder');
    const topOffset = this.getLineHeight(pos.line, codeMirror);
    if (placeholderEl instanceof HTMLElement && placeholderEl.offsetParent !== null) {
      const linesRect = codeMirrorLines.getBoundingClientRect();
      const textNode = Array.from(placeholderEl.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue && n.nodeValue.trim() !== '',
      );
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, textNode.nodeValue.length);
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      const placeholderRightRelative = Math.max(0, lastRect.right - linesRect.left);
      this.options.dom.style.left = `${placeholderRightRelative + codeWrapPaddingLeft - 80}px`;
    }
    this.options.dom.style.top = `${topOffset + codeWrapPaddingTop}px`;
  }
  /**
   * 判断是否需要隐藏Float工具栏
   * 有选中内容，或者光标所在行有内容时隐藏float 工具栏
   * @param {number} line
   * @param {CodeMirror.Editor} codeMirror
   * @returns {boolean} 是否需要隐藏float工具栏，true：需要隐藏
   */
  isHidden(line, codeMirror) {
    const selections = codeMirror.getSelections();
    if (selections.length > 1) {
      return true;
    }
    const selection = codeMirror.getSelection();
    if (selection.length > 0) {
      return true;
    }
    if (codeMirror.getLine(line)) {
      return true;
    }
    return false;
  }

  /**
   * 获取对应行的行高度，用来让float 工具栏在该行保持垂直居中
   * @param {number} line
   * @param {CodeMirror.Editor} codeMirror
   * @returns
   */
  getLineHeight(line, codeMirror) {
    let height = 0;
    // 计算到指定行（包括指定行）的位置
    codeMirror.getDoc().eachLine(0, line, (lineObj) => {
      height += lineObj.height;
    });

    // 为了让浮动菜单在当前行垂直居中，需要加上当前行高度的一半
    // 获取当前行的高度
    let currentLineHeight = 20; // 默认行高
    codeMirror.getDoc().eachLine(line, line + 1, (lineObj) => {
      currentLineHeight = lineObj.height;
    });

    // 返回到当前行顶部的高度 + 当前行高度的一半，实现垂直居中
    return height + currentLineHeight / 2;
  }
}
