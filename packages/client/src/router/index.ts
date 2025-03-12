import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/home/index.vue';

const About = () => import('../views/about/index.vue');

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/about', name: 'about', component: About },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
