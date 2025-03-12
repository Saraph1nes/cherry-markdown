import { createMemoryHistory, createRouter } from 'vue-router';
import Home from '../views/home/index.vue';
import About from '../views/about/index.vue';

const routes = [
  { path: '/', component: Home},
  { path: '/about', component: About },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes,
})

export default router;
