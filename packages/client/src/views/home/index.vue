<script setup lang="ts">
import { cherryInstance } from '../../components/CherryMarkdown';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore, type FileStore } from '../../store';
import { onMounted } from 'vue';
import initListener from '../../utils/listener';

const cherryMarkdown = cherryInstance();
const fileStore: FileStore = useFileStore();

onMounted(async () => {
  const cherryNoToolbar = document.querySelector('.cherry--no-toolbar');
  console.log(cherryNoToolbar, !cherryNoToolbar);
  await invoke('get_show_toolbar', { show: !cherryNoToolbar });
});

initListener(cherryMarkdown, fileStore);
</script>
