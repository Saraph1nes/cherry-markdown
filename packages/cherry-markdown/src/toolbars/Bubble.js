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
 * 在编辑区域选中文本时浮现的bubble工具栏
 */
export default class Bubble extends Toolbar {
  /**
   * @type {'flex' | 'block'}
   */
  static displayType = 'flex';
  // constructor(options) {
  //     super(options);
  // }

  set visible(visible) {
    const bubbleStyle = window.getComputedStyle(this.bubbleDom);
    if (visible) {
      bubbleStyle.display === 'none' && (this.bubbleDom.style.display = Bubble.displayType);
      // bubbleStyle.visibility !== 'visible' && (this.bubbleBottom.style.visibility = 'visible');
    } else {
      bubbleStyle.display !== 'none' && (this.bubbleDom.style.display = 'none');
      // bubbleStyle.visibility !== 'hidden' && (this.bubbleBottom.style.visibility = 'hidden');
    }
  }

  get visible() {
    const bubbleStyle = window.getComputedStyle(this.bubbleDom);
    return bubbleStyle.display !== 'none' && bubbleStyle.visibility !== 'hidden';
  }

  init() {
    this.options.editor = this.$cherry.editor;
    this.addSelectionChangeListener();
    this.bubbleDom = this.options.dom;
    this.editorDom = this.options.editor.getEditorDom();
    this.initBubbleDom();
    const editorContainer = this.editorDom.querySelector('.cm-editor') || this.editorDom;
    editorContainer.appendChild(this.bubbleDom);
    Object.entries(this.shortcutKeyMap).forEach(([key, value]) => {
      this.$cherry.toolbar.shortcutKeyMap[key] = value;
    });
  }

  appendMenusToDom(menus) {
    this.options.dom.appendChild(menus);
  }

  /**
   * 计算编辑区域的偏移量
   * @returns {number} 编辑区域的滚动区域
   */
  getScrollTop() {
    return this.options.editor.editor.getScrollInfo().top;
  }

  /**
   * 当编辑区域滚动的时候自动隐藏bubble工具栏和子工具栏
   */
  updatePositionWhenScroll() {
    if (this.bubbleDom.style.display === Bubble.displayType) {
      this.bubbleDom.style.marginTop = `${parseFloat(this.bubbleDom.dataset.scrollTop) - this.getScrollTop()}px`;
    }
  }

  /**
   * 根据高度计算bubble工具栏出现的位置的高度
   * 根据宽度计算bubble工具栏出现的位置的left值，以及bubble工具栏三角箭头的left值
   * @param {number} top 高度
   * @param {number} width 选中文本内容的宽度
   */
  showBubble(top, width) {
    if (!this.visible) {
      this.visible = true;
      this.bubbleDom.style.marginTop = '0';
      this.bubbleDom.dataset.scrollTop = String(this.getScrollTop());
    }
    const positionLimit = this.editorDom.querySelector('.CodeMirror-lines').firstChild.getBoundingClientRect();
    const editorPosition = this.editorDom.getBoundingClientRect();
    const minLeft = positionLimit.left - editorPosition.left;
    const maxLeft = positionLimit.width + minLeft;
    const minTop = this.bubbleDom.offsetHeight * 2;
    let $top = top;
    if ($top < minTop) {
      // 如果高度小于编辑器的顶部，则让bubble工具栏出现在选中文本的下放
      $top += this.bubbleDom.offsetHeight - this.bubbleTop.getBoundingClientRect().height;
      this.bubbleTop.style.display = 'block';
      this.bubbleBottom.style.display = 'none';
    } else {
      // 反之出现在选中文本内容的上方
      $top -= this.bubbleDom.offsetHeight + 2 * this.bubbleBottom.getBoundingClientRect().height;
      this.bubbleTop.style.display = 'none';
      this.bubbleBottom.style.display = 'block';
    }
    this.bubbleDom.style.top = `${$top}px`;
    let left = width - this.bubbleDom.offsetWidth / 2;
    if (left < minLeft) {
      // 如果位置超过了编辑器的最左边，则控制bubble工具栏不超出编辑器最左边
      // 同时bubble工具栏上的箭头尽量指向选中文本内容的中间位置
      left = minLeft;
      this.$setBubbleCursorPosition(`${width - minLeft}px`);
    } else if (left + this.bubbleDom.offsetWidth > maxLeft) {
      // 如果位置超过了编辑器的最右边，则控制bubble工具栏不超出编辑器最右边
      // 同时bubble工具栏上的箭头尽量指向选中文本内容的中间位置
      left = maxLeft - this.bubbleDom.offsetWidth;
      this.$setBubbleCursorPosition(`${width - left}px`);
    } else {
      // 让bubble工具栏的箭头处于工具栏的中间位置
      this.$setBubbleCursorPosition('50%');
    }
    // 安全边距 20px
    this.bubbleDom.style.left = `${Math.max(20, left)}px`;
  }

  hideBubble() {
    this.visible = false;
  }

  /**
   * 控制bubble工具栏的箭头的位置
   * @param {string} left 左偏移量
   */
  $setBubbleCursorPosition(left = '50%') {
    if (left === '50%') {
      this.bubbleTop.style.left = '50%';
      this.bubbleBottom.style.left = '50%';
    } else {
      const $left = parseFloat(left) < 10 ? '10px' : left;
      this.bubbleTop.style.left = $left;
      this.bubbleBottom.style.left = $left;
    }
  }

  initBubbleDom() {
    const top = document.createElement('div');
    top.className = 'cherry-bubble-top';
    const bottom = document.createElement('div');
    bottom.className = 'cherry-bubble-bottom';
    this.bubbleTop = top;
    this.bubbleBottom = bottom;
    this.bubbleDom.appendChild(top);
    this.bubbleDom.appendChild(bottom);
    // 默认不可见
    this.visible = false;
  }

  getBubbleDom() {
    return this.bubbleDom;
  }

  addSelectionChangeListener() {
    console.log('this.options.editor =>', this.options.editor);
    // 监听编辑器内容变更,隐藏bubble工具栏
    this.options.editor.editor.dom.addEventListener('input', () => {
      this.hideBubble();
    });

    // 监听编辑器刷新,隐藏bubble工具栏
    this.options.editor.editor.dom.addEventListener('refresh', () => {
      this.hideBubble();
    });

    // 监听编辑器滚动,同步bubble工具栏位置
    this.options.editor.editor.dom.addEventListener('scroll', () => {
      this.updatePositionWhenScroll();
    });

    // 监听选区变化
    this.options.editor.editor.dom.addEventListener('beforeSelectionChange', () => {
      console.log('xyxlog selectionSet');
      const { state } = this.options.editor;
      const selection = state.selection.main;
      const selectionStr = state.sliceDoc(selection.from, selection.to);

      if (selectionStr !== this.lastSelectionsStr && (selectionStr || this.lastSelectionsStr)) {
        const selections = [selectionStr];
        this.lastSelections = !this.lastSelections ? [] : this.lastSelections;
        this.$cherry.$event.emit('selectionChange', { selections, lastSelections: this.lastSelections });
        this.lastSelections = selections;
        this.lastSelectionsStr = selectionStr;
      }

      // 处理bubble工具栏显示/隐藏
      if (selectionStr.length <= 0) {
        this.hideBubble();
        return;
      }

      const editorPosition = this.editorDom.getBoundingClientRect();
      const selectionPosition = this.options.editor.coordsAtPos(selection.from);
      const selectionEndPosition = this.options.editor.coordsAtPos(selection.to);

      if (!selectionPosition || !selectionEndPosition) {
        this.hideBubble();
        return;
      }

      const top = selectionPosition.top - editorPosition.top;
      const width =
        selectionEndPosition.left - editorPosition.left + (selectionEndPosition.right - selectionEndPosition.left) / 2;

      this.showBubble(top, width);
    });
  }
}
