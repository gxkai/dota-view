import { createRouter, createWebHistory } from "vue-router";
import { state } from "@/store";

export const routes = [];

const router = createRouter({
  history: createWebHistory(),
  routes,
  
  scrollBehavior(to, from, savedPosition) {
    return { top: 0 };
  },
});

router.beforeEach((to, from, next) => {
  state.showOverlay = false
  next()
},)

export default router;
