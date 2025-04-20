import { createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import App from './App.vue';
import 'cherry-markdown/dist/cherry-markdown.css';
import { createPinia } from 'pinia';
import router from './router/index';

import 'tdesign-vue-next/es/style/index.css';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(TDesign);
app.mount('#app');
