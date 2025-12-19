/** @type {import('~types/editor')} */
export default class Editor {
    /**
     * @constructor
     * @param {Partial<EditorConfiguration>} options
     */
    constructor(options: Partial<EditorConfiguration>);
    /**
     * @property
     * @type {EditorConfiguration}
     */
    options: EditorConfiguration;
    /** @type {CM6AdapterType | null} */
    editor: CM6AdapterType | null;
    animation: {
        timer: number;
        destinationTop: number;
    };
    disableScrollListener: boolean;
    $cherry: import("./Cherry").default;
    refresh(): void;
    /**
     * 禁用快捷键
     * @param {boolean} disable 是否禁用快捷键
     */
    disableShortcut: (disable?: boolean) => void;
    /**
     * 在onChange后处理draw.io的xml数据和图片的base64数据，对这种超大的数据增加省略号，
     * 以及对全角符号进行特殊染色。
     */
    dealSpecialWords: () => void;
    /**
     * 把大字符串变成省略号
     * @param {*} reg 正则
     * @param {*} className 利用codemirror的MarkText生成的新元素的class
     */
    formatBigData2Mark: (reg: any, className: any) => void;
    /**
     * 高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》
     * full width翻译为全角
     */
    formatFullWidthMark(): void;
    /**
     * 将全角符号转换为半角符号
     * @param {EditorView | CM6AdapterType} editorView - 编辑器实例
     * @param {MouseEvent} evt - 鼠标事件对象
     */
    toHalfWidth(editorView: EditorView | CM6AdapterType, evt: MouseEvent): void;
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
    onKeyup: (e: KeyboardEvent, editorView: EditorView) => void;
    /**
     *
     * @param {ClipboardEvent} e
     * @param {CM6AdapterType} editorView
     */
    onPaste(e: ClipboardEvent, editorView: CM6AdapterType): void;
    /**
     *
     * @param {ClipboardEvent} event
     * @param {ClipboardEvent['clipboardData']} clipboardData
     * @param {CM6AdapterType} editorView
     * @returns {boolean | void}
     */
    handlePaste(event: ClipboardEvent, clipboardData: ClipboardEvent["clipboardData"], editorView: CM6AdapterType): boolean | void;
    fileUploadCount: number;
    /**
     *
     * @param {EditorView} editorView
     */
    onScroll: (editorView: EditorView) => void;
    /**
     *
     * @param {EditorView | CM6AdapterType} editorView - 当前的CodeMirror实例
     * @param {MouseEvent} evt
     */
    onMouseDown: (editorView: EditorView | CM6AdapterType, evt: MouseEvent) => void;
    /**
     * 光标变化事件
     */
    onCursorActivity: () => void;
    /**
     *
     * @param {*} previewer
     */
    init(previewer: any): void;
    previewer: any;
    /**
     *
     * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
     * @param {number} [endLine] 终止行
     * @param {number} [percent] 百分比，取值0~1
     */
    jumpToLine(beginLine: number | null, endLine?: number, percent?: number): void;
    /**
     *
     * @param {number | null} lineNum
     * @param {number} [endLine]
     * @param {number} [percent]
     */
    scrollToLineNum(lineNum: number | null, endLine?: number, percent?: number): void;
    /**
     *
     * @returns {HTMLElement}
     */
    getEditorDom(): HTMLElement;
    /**
     *
     * @param {string} event 事件名
     * @param {EditorEventCallback} callback 回调函数
     */
    addListener(event: string, callback: EditorEventCallback): void;
    /**
     * 初始化书写风格
     */
    initWritingStyle(): void;
    /**
     * 刷新书写状态
     */
    refreshWritingStatus(): void;
    /**
     * 修改书写风格
     */
    setWritingStyle(writingStyle: any): void;
    /**
     * 设置编辑器值
     */
    setValue(value?: string): void;
    /**
     * 获取编辑器值
     */
    getValue(): string;
    /**
     * 替换选中的文本
     */
    replaceSelections(text?: any[]): void;
    /**
     * 获取光标位置
     */
    getCursor(): {
        line: number;
        ch: number;
    };
    /**
     * 设置光标位置
     */
    setCursor(line: any, ch: any): void;
    /**
     * 聚焦编辑器
     */
    focus(): void;
    /**
     * 获取选中的文本
     * @returns {string[]}
     */
    getSelections(): string[];
    /**
     * 获取当前选中的文本
     * @returns {string}
     */
    getSelection(): string;
    /**
     * 设置选区
     * @param {Object} from - 起始位置 {line: number, ch: number}
     * @param {Object} to - 结束位置 {line: number, ch: number}
     */
    setSelection(from: any, to: any): void;
}
export type EditorConfiguration = import("~types/editor").EditorConfiguration;
export type EditorEventCallback = import("~types/editor").EditorEventCallback;
export type CM6AdapterType = import("~types/editor").CM6Adapter;
export type CodeMirror = typeof import("codemirror");
export type MarkEffectValue = {
    from: number;
    to: number;
    decoration?: Decoration;
    options?: any;
};
import { EditorView } from '@codemirror/view';
import { Decoration } from '@codemirror/view';
