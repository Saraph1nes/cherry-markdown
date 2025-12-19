export default imgToolHandler;
declare namespace imgToolHandler {
    let mouseResize: {};
    namespace position {
        let x: number;
        let y: number;
    }
    function getImgPosition(): {
        bottom: number;
        top: number;
        height: any;
        width: any;
        right: number;
        left: number;
        x: number;
        y: number;
    };
    function showBubble(img: any, container: any, previewerDom: any, event: any, locale: any): void;
    function emit(type: any, event?: {}): void;
    function previewUpdate(callback: any): void;
    function remove(): void;
    function $isResizing(): any;
    function dealScroll(event: any): void;
    function change(): void;
    function bindChange(func: any): void;
}
