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
import { getCodeBlockRule } from '@/utils/regexp';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { getCodePreviewLangSelectElement } from '@/utils/code-preview-language-setting';
import { copyToClip } from '@/utils/copy';

// 语言映射 - 只使用已安装的语言包
const languageMap = {
  javascript: () => javascript(),
  js: () => javascript(),
  typescript: () => javascript(),
  ts: () => javascript(),
  css: () => css(),
  html: () => html(),
  markdown: () => markdown(),
  md: () => markdown(),
  yaml: () => yaml(),
  yml: () => yaml(),
};

export default class CodeBlockHandler {
  /**
   * 用来存放所有的数据
   */
  codeBlockEditor = {
    info: {}, // 当前点击的预览区域code的相关信息
    editorDom: {}, // 编辑器容器
  };

  constructor(trigger, target, container, previewerDom, codeMirror, parent) {
    // 触发方式 click / hover
    this.trigger = trigger;
    this.target = target;
    this.previewerDom = previewerDom;
    this.container = container;
    this.codeMirror = codeMirror;
    this.$cherry = parent.previewer.$cherry;
    this.parent = parent;
    this.$initReg();
  }

  $initReg() {
    this.codeBlockReg = this.codeBlockReg ? this.codeBlockReg : getCodeBlockRule().reg;
  }

  emit(type, event = {}, callback = () => {}) {
    switch (type) {
      case 'remove':
        return this.$remove();
      case 'scroll':
        return this.$updateContainerPosition();
      case 'previewUpdate':
        this.$updateContainerPosition();
        this.editing && this.$setInputOffset();
        return;
      case 'mouseup':
        return this.$tryRemoveMe(event, callback);
      case 'resize':
        return this.$updateContainerPosition();
    }
  }
  $remove() {
    this.codeBlockEditor = { info: {}, codeBlockCodes: [], editorDom: {} };
  }
  $tryRemoveMe(event, callback) {
    const dom = this.codeBlockEditor.editorDom.inputDiv;
    if (this.editing && dom && !dom.contains(event.target)) {
      this.editing = false;
      this.$remove();
      callback();
    }
  }
  /**
   * 定位代码块源代码在左侧Editor的位置
   */
  $findCodeInEditor(selectLang = false) {
    this.$collectCodeBlockDom();
    this.$collectCodeBlockCode();
    if (selectLang) {
      this.$setLangSelection(this.codeBlockEditor.info.codeBlockIndex);
    } else {
      this.$setBlockSelection(this.codeBlockEditor.info.codeBlockIndex);
    }
  }
  /**
   * 找到预览区被点击编辑按钮的代码块，并记录这个代码块在预览区域所有代码块中的顺位
   */
  $collectCodeBlockDom() {
    const list = Array.from(this.previewerDom.querySelectorAll('[data-type="codeBlock"]'));
    this.codeBlockEditor.info = {
      codeBlockNode: this.target,
      codeBlockIndex: list.indexOf(this.target),
    };
  }
  $collectCodeBlockCode() {
    const codeBlockCodes = [];
    // 使用 CodeMirror 6 的 getValue 方法
    const editorValue = this.codeMirror.editorView.state.doc.toString();
    editorValue.replace(this.codeBlockReg, function (whole, ...args) {
      const match = whole.replace(/^\n*/, '');
      const offsetBegin = args[args.length - 2] + whole.match(/^\n*/)[0].length;
      if (!match.startsWith('```mermaid')) {
        codeBlockCodes.push({
          code: match,
          offset: offsetBegin,
        });
      }
    });
    this.codeBlockEditor.codeBlockCodes = codeBlockCodes;
  }
  $setBlockSelection(index) {
    const codeBlockCode = this.codeBlockEditor.codeBlockCodes[index];
    // 使用 CodeMirror 6 的 getValue 方法
    const whole = this.codeMirror.editorView.state.doc.toString();
    const beginLine = whole.slice(0, codeBlockCode.offset).match(/\n/g)?.length ?? 0;
    const endLine = beginLine + codeBlockCode.code.match(/\n/g).length;
    const endCh = codeBlockCode.code.slice(0, -3).match(/[^\n]+\n*$/)[0].length;

    // CodeMirror 6 选择方式
    if (this.codeMirror.editorView) {
      const view = this.codeMirror.editorView;
      const doc = view.state.doc;
      const startLine = doc.line(beginLine + 2); // +2 因为跳过第一行的 ```
      const endLineObj = doc.line(endLine);
      const from = startLine.from;
      const to = endLineObj.from + endCh;

      view.dispatch({
        selection: { anchor: to, head: from },
        scrollIntoView: true,
      });
    } else {
      // 兼容 CodeMirror 5
      this.codeBlockEditor.info.selection = [
        { line: endLine - 1, ch: endCh },
        { line: beginLine + 1, ch: 0 },
      ];
      this.codeMirror.setSelection(...this.codeBlockEditor.info.selection);
    }
  }
  $setLangSelection(index) {
    const codeBlockCode = this.codeBlockEditor.codeBlockCodes[index];
    // 使用 CodeMirror 6 的 getValue 方法
    const whole = this.codeMirror.editorView.state.doc.toString();
    const beginLine = whole.slice(0, codeBlockCode.offset).match(/\n/g)?.length ?? 0;
    const firstLine = codeBlockCode.code.match(/```\s*[^\n]+/)[0] ?? '```';
    const beginCh = 3;
    const endCh = firstLine.length;

    // CodeMirror 6 选择方式
    if (this.codeMirror.editorView) {
      const view = this.codeMirror.editorView;
      const doc = view.state.doc;
      const lineObj = doc.line(beginLine + 1);
      const from = lineObj.from + beginCh;
      const to = lineObj.from + endCh;

      view.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
    } else {
      // 兼容 CodeMirror 5
      this.codeBlockEditor.info.selection = [
        { line: beginLine, ch: beginCh },
        { line: beginLine, ch: endCh },
      ];
      this.codeMirror.setSelection(...this.codeBlockEditor.info.selection);
    }
  }
  showBubble(isEnableBubbleAndEditorShow = true) {
    this.$updateContainerPosition();
    if (this.trigger === 'hover') {
      this.$showBtn(isEnableBubbleAndEditorShow);
    }
    if (this.trigger === 'click') {
      this.$showContentEditor();
    }
    /**
     * 把代码块操作相关元素上的鼠标滚动事件同步到预览区
     */
    this.container.addEventListener('wheel', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.previewerDom.scrollTop += e.deltaY / 3; // 降低滚动的速度，懒得加动画了
    });
  }
  /**
   * 展示代码块编辑区的编辑器
   */
  $showContentEditor() {
    this.editing = true;
    this.$findCodeInEditor();
    this.$drawEditor();
  }
  /**
   * 展示代码块区域的按钮
   */
  $showBtn(isEnableBubbleAndEditorShow) {
    const { changeLang, editCode, copyCode, lang, expandCode } = this.target.dataset;
    this.container.innerHTML = '';
    if (changeLang === 'true' && isEnableBubbleAndEditorShow) {
      // 添加删除btn
      this.container.innerHTML = getCodePreviewLangSelectElement(lang);
      const changeLangDom = this.container.querySelector('#code-preview-lang-select');
      this.changeLangDom = changeLangDom;
      this.changeLangDom.addEventListener('change', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.parent.$removeAllPreviewerBubbles('click');
        this.$changeLang(e.target.value || '');
      });
    }
    // 第一行的按钮的right值
    let oneLineBtnsRight = 10;
    if (editCode === 'true' && isEnableBubbleAndEditorShow) {
      // 添加编辑btn
      const editDom = document.createElement('div');
      editDom.className = 'cherry-edit-code-block';
      editDom.innerHTML = '<i class="ch-icon ch-icon-edit"></i>';
      editDom.style.right = `${oneLineBtnsRight}px`;
      this.container.appendChild(editDom);
      editDom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.$expandCodeBlock(true, e);
        this.$hideAllBtn();
        this.parent.$removeAllPreviewerBubbles('click');
        this.parent.showCodeBlockPreviewerBubbles('click', this.target);
      });
      this.editDom = editDom;
      oneLineBtnsRight += 8;
    }
    if (copyCode === 'true') {
      // 添加复制btn
      const copyDom = document.createElement('div');
      copyDom.className = 'cherry-copy-code-block';
      copyDom.innerHTML = '<i class="ch-icon ch-icon-copy"></i>';
      copyDom.style.right = `${oneLineBtnsRight}px`;
      this.container.appendChild(copyDom);
      copyDom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.parent.$removeAllPreviewerBubbles('click');
        this.$copyCodeBlock();
      });
      this.copyDom = copyDom;
      oneLineBtnsRight += 8;
    }
    const { customBtns } = this.$cherry.options.engine.syntax.codeBlock;
    if (customBtns) {
      this.codeBlockCustomBtns = [];
      customBtns.forEach((btn) => {
        const dom = document.createElement('div');
        dom.className = 'cherry-code-block-custom-btn';
        dom.innerHTML = btn.html;
        dom.style.right = `${oneLineBtnsRight}px`;
        this.container.appendChild(dom);
        dom.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const codeContent = this.target.querySelector('pre').innerText;
          const language = this.target.dataset.lang ?? '';
          btn.onClick(e, codeContent, language, this.target);
        });
        this.codeBlockCustomBtns.push(dom);
        oneLineBtnsRight += 8;
      });
    }
    if (expandCode === 'true') {
      const isExpand = this.target.classList.contains('cherry-code-expand');
      const maskDom = this.target.querySelector('.cherry-mask-code-block');
      // 添加缩起btn
      const unExpandDom = document.createElement('div');
      unExpandDom.className = 'cherry-unExpand-code-block';
      unExpandDom.innerHTML = '<i class="ch-icon ch-icon-unExpand"></i>';
      unExpandDom.style.right = `${oneLineBtnsRight}px`;
      if (!isExpand || !maskDom) {
        unExpandDom.classList.add('hidden');
      }
      this.container.appendChild(unExpandDom);
      unExpandDom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.parent.$removeAllPreviewerBubbles('click');
        this.$expandCodeBlock(false, e);
      });
      this.unExpandDom = unExpandDom;
      oneLineBtnsRight += 8;
    }
  }
  // 隐藏所有按钮（切换语言、编辑、复制）
  $hideAllBtn() {
    if (this.changeLangDom?.style?.display) {
      this.changeLangDom.style.display = 'none';
    }
    if (this.editDom?.style?.display) {
      this.editDom.style.display = 'none';
    }
    if (this.copyDom?.style?.display) {
      this.copyDom.style.display = 'none';
    }
    if (this.unExpandDom?.style?.display) {
      this.unExpandDom.style.display = 'none';
    }
  }
  /**
   * 切换代码块的语言
   */
  $changeLang(lang) {
    this.$findCodeInEditor(true);
    // 使用 CodeMirror 6 的 replaceSelection 方法
    if (this.codeMirror.editorView) {
      const view = this.codeMirror.editorView;
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: lang },
        selection: { anchor: selection.from + lang.length },
      });
    } else {
      // 兼容 CodeMirror 5
      this.codeMirror.replaceSelection(lang, 'around');
    }
  }
  $drawEditor() {
    const dom = document.createElement('div');
    dom.className = 'cherry-previewer-codeBlock-content-handler__input';

    // 获取当前选中的代码内容
    const selectedCode = this.codeMirror.editorView
      ? this.codeMirror.editorView.state.sliceDoc(
          this.codeMirror.editorView.state.selection.main.from,
          this.codeMirror.editorView.state.selection.main.to,
        )
      : this.codeMirror.getSelection();

    // 提取语言类型
    const langMatch = selectedCode.match(/```(\w+)/);
    const language = langMatch ? langMatch[1] : '';

    // 创建 CodeMirror 6 编辑器
    const extensions = [
      lineNumbers(),
      keymap.of([...defaultKeymap]),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-content': { padding: '10px' },
        '.cm-focused': { outline: 'none' },
        '.cm-scroller': { fontFamily: 'inherit' },
      }),
    ];

    // 根据语言添加语法高亮
    if (language && languageMap[language.toLowerCase()]) {
      extensions.push(languageMap[language.toLowerCase()]());
    }

    // 创建更新监听器
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // 更新主编辑器内容
        const currentContent = update.state.doc.toString();
        if (this.codeMirror.editorView) {
          const view = this.codeMirror.editorView;
          const selection = view.state.selection.main;
          view.dispatch({
            changes: {
              from: selection.from,
              to: selection.to,
              insert: currentContent,
            },
          });
        } else {
          // 兼容 CodeMirror 5
          this.codeMirror.replaceSelection(currentContent, 'around');
        }
      }
    });

    const startState = EditorState.create({
      doc: selectedCode,
      extensions: extensions.concat([updateListener]),
    });

    const editorInstance = new EditorView({
      state: startState,
      parent: dom,
    });

    this.codeBlockEditor.editorDom.inputDiv = dom;
    this.codeBlockEditor.editorDom.inputDom = editorInstance;
    this.$updateEditorPosition();
    this.container.appendChild(this.codeBlockEditor.editorDom.inputDiv);

    // 聚焦编辑器
    editorInstance.focus();
  }

  /**
   * 处理扩展、缩起代码块的操作
   */
  $expandCodeBlock(isExpand = true, event) {
    if (!this.unExpandDom) {
      return;
    }
    this.target.classList.remove('cherry-code-unExpand');
    this.target.classList.remove('cherry-code-expand');
    this.unExpandDom.classList.remove('hidden');
    const codeContent = this.target.querySelector('pre').innerText;
    if (isExpand) {
      if (this.$cherry.options.callback.onExpandCode) {
        this.$cherry.options.callback.onUnExpandCode(event, codeContent);
      }
      this.target.classList.add('cherry-code-expand');
    } else {
      if (this.$cherry.options.callback.onExpandCode) {
        this.$cherry.options.callback.onExpandCode(event, codeContent);
      }
      this.unExpandDom.classList.add('hidden');
      this.target.classList.add('cherry-code-unExpand');
    }
  }
  /**
   * 处理复制代码块的操作
   */
  $copyCodeBlock() {
    const codeContent = this.target.querySelector('pre').innerText;
    const final = this.$cherry.options.callback.onCopyCode({ target: this.target }, codeContent);
    if (final === false) {
      return false;
    }
    const iconNode = this.copyDom.querySelector('i.ch-icon-copy');
    if (iconNode) {
      iconNode.className = iconNode.className.replace('copy', 'ok');
      setTimeout(() => {
        iconNode.className = iconNode.className.replace('ok', 'copy');
      }, 1000);
    }
    copyToClip(final);
  }

  /**
   * 更新代码块复制、编辑等按钮的位置
   */
  $updateContainerPosition() {
    this.codeBlockEditor.info.codeBlockNode = this.target;
    const codeBlockInfo = this.$getPosition();
    this.setStyle(this.container, 'width', `${codeBlockInfo.width}px`);
    this.setStyle(this.container, 'top', `${codeBlockInfo.top}px`);
    this.setStyle(this.container, 'left', `${codeBlockInfo.left}px`);
  }

  /**
   * 更新编辑器的位置（尺寸和位置）
   */
  $updateEditorPosition() {
    this.$setInputOffset();
    const spanStyle = getComputedStyle(this.codeBlockEditor.info.codeBlockNode);
    const editorWrapper = this.codeBlockEditor.editorDom.inputDom.dom;
    this.setStyle(editorWrapper, 'fontSize', spanStyle.fontSize || '16px');
    this.setStyle(editorWrapper, 'fontFamily', spanStyle.fontFamily);
    this.setStyle(editorWrapper, 'lineHeight', '1.8em');
    this.setStyle(editorWrapper, 'zIndex', '1');
  }

  /**
   * 设置codemirror偏移
   */
  $setInputOffset() {
    const codeBlockInfo = this.$getPosition();
    const { inputDiv } = this.codeBlockEditor.editorDom;
    // 设置文本框的大小
    this.setStyle(inputDiv, 'width', `${codeBlockInfo.width}px`);
    this.setStyle(inputDiv, 'height', `${codeBlockInfo.height + 10}px`);
  }

  setStyle(element, property, value) {
    const info = element.getBoundingClientRect();
    if (info[property] !== value) {
      element.style[property] = value;
    }
  }

  $getPosition() {
    const node = this.codeBlockEditor.info.codeBlockNode;
    const position = node.getBoundingClientRect();
    const editorPosition = this.previewerDom.parentNode.getBoundingClientRect();
    return {
      top: position.top - editorPosition.top,
      height: position.height,
      width: position.width,
      left: position.left - editorPosition.left,
      maxHeight: editorPosition.height,
    };
  }
}
