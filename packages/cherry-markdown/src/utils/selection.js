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

/**
 * 获取用户选中的文本内容，如果没有选中文本，则返回光标所在的位置的内容
 * @param {import('@codemirror/view').EditorView} cm EditorView实例
 * @param {string} selection 当前选中的文本内容
 * @param {string} type  'line': 当没有选择文本时，获取光标所在行的内容； 'word': 当没有选择文本时，获取光标所在单词的内容
 * @param {boolean} focus true；强行选中光标处的内容，否则只获取选中的内容
 * @returns {string}
 */
export function getSelection(cm, selection, type = 'word', focus = false) {
  // 多光标模式下不做处理
  if (cm.state.selection.ranges.length > 1) {
    return selection;
  }
  if (selection && !focus) {
    return selection;
  }
  // 获取光标所在行的内容，同时选中所在行
  if (type === 'line') {
    const selection = cm.state.selection.main;
    const lineStart = cm.state.doc.lineAt(selection.from);
    const lineEnd = cm.state.doc.lineAt(selection.to);

    // 如果开始位置在结束位置后面,交换它们
    const from = selection.from > selection.to ? selection.to : selection.from;
    const to = selection.from > selection.to ? selection.from : selection.to;

    const startPos = lineStart.from;
    const endPos = lineEnd.to;

    cm.dispatch({
      selection: {
        anchor: startPos,
        head: endPos,
      },
    });

    return cm.state.sliceDoc(startPos, endPos);
  }

  // 获取光标所在单词的内容，同时选中所在单词
  if (type === 'word') {
    const pos = cm.state.selection.main.head;
    const line = cm.state.doc.lineAt(pos);
    const lineText = line.text;

    // 简单的单词边界检测
    let start = pos - line.from;
    let end = start;

    while (start > 0 && /\w/.test(lineText[start - 1])) {
      start = start - 1;
    }
    while (end < lineText.length && /\w/.test(lineText[end])) {
      end = end + 1;
    }

    const from = line.from + start;
    const to = line.from + end;

    cm.dispatch({
      selection: {
        anchor: from,
        head: to,
      },
    });

    return cm.state.sliceDoc(from, to);
  }
}
