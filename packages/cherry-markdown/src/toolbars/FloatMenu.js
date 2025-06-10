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
    const self = this;

    this.editor.on('cursorActivity', (editor, evt) => {
      // 当编辑区光标位置改变时触发
      self.cursorActivity(evt, editor);
    });

    this.editor.on('update', (editor, evt) => {
      // 当编辑区内容改变时触发
      self.cursorActivity(evt, editor);
    });

    // refresh 事件在 CodeMirror 6 中不存在，可以移除或用其他方式替代
    // 如果需要，可以监听其他事件来代替
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
   * @param {Object} editor
   * @returns
   */
  cursorActivity(evt, editor) {
    const pos = editor.getCursor();
    const codeMirrorLines = document.querySelector('.cherry-editor .cm-lineWrapping');
    if (!codeMirrorLines) {
      return false;
    }
    const computedLinesStyle = getComputedStyle(codeMirrorLines);
    const codeWrapPaddingLeft = parseFloat(computedLinesStyle.paddingLeft);
    const codeWrapPaddingTop = parseFloat(computedLinesStyle.paddingTop);

    console.log('codeMirrorLines', {
      codeMirrorLines,
      computedLinesStyle,
      codeWrapPaddingLeft,
      codeWrapPaddingTop,
    });

    if (this.isHidden(pos.line, editor)) {
      this.options.dom.style.display = 'none';
      return false;
    }
    this.options.dom.style.display = 'inline-block';
    this.options.dom.style.left = `${codeWrapPaddingLeft}px`;
    this.options.dom.style.top = `${this.getLineHeight(pos.line, editor) + codeWrapPaddingTop}px`;
  }

  /**
   * 判断是否需要隐藏Float工具栏
   * 有选中内容，或者光标所在行有内容时隐藏float 工具栏
   * @param {number} line
   * @param {Object} editor
   * @returns {boolean} 是否需要隐藏float工具栏，true：需要隐藏
   */
  isHidden(line, editor) {
    const selections = editor.getSelections();
    // 检查是否有多个选择区域（多光标模式）
    if (selections.length > 1) {
      return true;
    }
    // 检查是否有选中内容
    const selection = editor.getSelection();
    if (selection.length > 0) {
      return true;
    }
    // 检查光标所在行是否有内容
    if (editor.getLine(line)) {
      return true;
    }
    return false;
  }

  /**
   * 获取对应行的行高度，用来让float 工具栏在该行保持垂直居中
   * @param {number} line
   * @param {Object} editor
   * @returns
   */
  getLineHeight(line, editor) {
    const view = editor.editorView;
    if (!view) return 0;

    try {
      // 获取指定行的位置
      const lineObj = view.state.doc.line(line + 1); // CodeMirror 6 行号从1开始
      const blockInfo = view.lineBlockAt(lineObj.from);
      console.log('lineObj', {
        lineObj,
        blockInfo,
      });
      return blockInfo.top;
    } catch (e) {
      // 如果行号无效，返回0
      return 0;
    }
  }
}
