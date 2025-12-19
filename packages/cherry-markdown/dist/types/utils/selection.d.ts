/**
 * 获取用户选中的文本内容，如果没有选中文本，则返回光标所在的位置的内容
 * @param {import('@codemirror/view').EditorView | import('~types/editor').CM6Adapter} view CodeMirror 6 EditorView实例或CM6Adapter
 * @param {string} selection 当前选中的文本内容
 * @param {string} type  'line': 当没有选择文本时，获取光标所在行的内容； 'word': 当没有选择文本时，获取光标所在单词的内容
 * @param {boolean} focus true；强行选中光标处的内容，否则只获取选中的内容
 * @returns {string}
 */
export function getSelection(view: import("@codemirror/view").EditorView | import("~types/editor").CM6Adapter, selection: string, type?: string, focus?: boolean): string;
