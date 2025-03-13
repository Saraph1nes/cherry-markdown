import { listen } from '@tauri-apps/api/event';
import Cherry from 'cherry-markdown';
import {
  handleAboutMenu,
  handleSettingMenu,
  handleToggleToolbar,
  newFile,
  openFile,
  saveAsNewMarkdown,
  saveMarkdown,
} from './handler';
import type { FileStore } from '../store';

const initListener = (cherryMarkdown: Cherry, fileStore: FileStore) => {
  listen('new_file', () => newFile(cherryMarkdown, fileStore));
  listen('open_file', () => openFile(cherryMarkdown, fileStore));
  listen('save', () => {
    // todo: 1如果没有文件路径，就弹出转移到另存为；2只有在被更改过的情况下才进行保存；3这里要改变save的按钮disabled状态
    saveMarkdown(cherryMarkdown, fileStore);
  });
  listen('save_as', () => saveAsNewMarkdown(cherryMarkdown, fileStore));
  listen('toggle_toolbar', () => handleToggleToolbar(cherryMarkdown));
  listen('about_menu', handleAboutMenu);
  listen('setting_menu', handleSettingMenu);
};

export default initListener;
