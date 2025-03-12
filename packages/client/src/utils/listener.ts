import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import Cherry from 'cherry-markdown';
import { invoke } from '@tauri-apps/api/core';
import { newFile, openFile, saveAsNewMarkdown, saveMarkdown } from './handler';
import type { FileStore } from '../store';

const initListener = (cherryMarkdown: Cherry, fileStore: FileStore) => {
  listen('new_file', () => newFile(cherryMarkdown, fileStore));
  listen('open_file', () => openFile(cherryMarkdown, fileStore));
  listen('save', () => {
    // todo: 1如果没有文件路径，就弹出转移到另存为；2只有在被更改过的情况下才进行保存；3这里要改变save的按钮disabled状态
    saveMarkdown(cherryMarkdown, fileStore);
  });
  listen('save_as', async () => saveAsNewMarkdown(cherryMarkdown, fileStore));
  listen('toggle_toolbar', async () => {
    const cherryNoToolbar = document.querySelector('.cherry--no-toolbar');
    console.log(cherryNoToolbar, !cherryNoToolbar);
    await invoke('get_show_toolbar', { show: !!cherryNoToolbar });
    cherryMarkdown.toolbar.toolbarHandlers.settings('toggleToolbar');
  });
  // 关于窗口
  listen('about_menu', async () => {
    const window = new WebviewWindow('about', {
      url: '/about',
      width: 400,
      height: 300,
      title: '关于',
      resizable: false,
      skipTaskbar: true,
      decorations: true,
      center: false,
      alwaysOnTop: true,
      focus: true,
    });
    window.once('tauri://created', async () => {
      console.log('tauri://created');
    });
    window.once('tauri://error', async (error) => {
      console.log('window create error!', error);
    });
  });
};

export default initListener;
