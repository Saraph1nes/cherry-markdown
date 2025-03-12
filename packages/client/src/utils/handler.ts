import Cherry from 'cherry-markdown';
import type { FileStore } from '../store';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save, open } from '@tauri-apps/plugin-dialog';
import { previewOnlySidebar } from './index';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';

/**
 * New file
 * @param cherryMarkdown
 * @param fileStore
 */
export const newFile = (cherryMarkdown: Cherry, fileStore: FileStore) => {
  cherryMarkdown.setMarkdown('');
  fileStore.setCurrentFilePath('');
};

/**
 * Open file
 * @param cherryMarkdown
 * @param fileStore
 * @returns
 */
export const openFile = async (cherryMarkdown: Cherry, fileStore: FileStore) => {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'markdown',
        extensions: ['md'],
      },
    ],
  });
  console.log(path);
  if (path === null) {
    return;
  }
  fileStore.setCurrentFilePath(path);
  const markdown = await readTextFile(path);
  console.log(markdown);
  cherryMarkdown.setMarkdown(markdown);
  cherryMarkdown.switchModel('previewOnly');
  previewOnlySidebar();
};

/**
 * Save as a new file
 * @param cherryMarkdown
 * @param fileStore
 */
export const saveAsNewMarkdown = async (cherryMarkdown: Cherry, fileStore: FileStore) => {
  const markdown = cherryMarkdown.getMarkdown();
  const path = await save({
    filters: [
      {
        name: 'Cherry Markdown',
        extensions: ['md', 'markdown'],
      },
    ],
  });
  if (!path) {
    return;
  }
  fileStore.setCurrentFilePath(path);
  writeTextFile(path, markdown);
};

/**
 * Save file
 * @param cherryMarkdown
 * @param fileStore
 * @returns
 */
export const saveMarkdown = (cherryMarkdown: Cherry, fileStore: FileStore) => {
  const markdown = cherryMarkdown.getMarkdown();
  // If there is no file path, it is ejected to save as
  if (!fileStore.currentFilePath) {
    saveAsNewMarkdown(cherryMarkdown, fileStore);
    return;
  }
  writeTextFile(fileStore.currentFilePath, markdown);
};

/**
 * About menu
 */
export const handleAboutMenu = async () => {
  const window = new WebviewWindow('about', {
    url: '/about',
    width: 400,
    height: 300,
    title: 'About',
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
};

/**
 * Toggle toolbar
 * @param cherryMarkdown
 */
export const handleToggleToolbar = async (cherryMarkdown: Cherry) => {
  const cherryNoToolbar = document.querySelector('.cherry--no-toolbar');
  console.log(cherryNoToolbar, !cherryNoToolbar);
  await invoke('get_show_toolbar', { show: !!cherryNoToolbar });
  cherryMarkdown.toolbar.toolbarHandlers.settings('toggleToolbar');
};
