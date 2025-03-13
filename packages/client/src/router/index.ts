import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/home/index.vue';
import About from '../views/about/index.vue';
import Setting from '../views/setting/index.vue';

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/about', name: 'about', component: About },
  { path: '/setting', name: 'setting', component: Setting },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
