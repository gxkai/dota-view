import { name } from "../package.json";
import { ModuleOptions } from "vue-module-loader/dist/interfaces";
import "./assets/css/tailwind.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { useModule } from "vue-module-loader";
import ui from '../packages/ui/src/module'
import sign from '../packages/sign/src/module'
import store from '../packages/store/src/module'
export default {
  name,
  async install(
    ctx
  ) {
    const app = createApp(App);
    // 主框架实例化后应存储在上下文对象中供其他模块安装时使用
    ctx.app = app;
    ctx.router = router
    await useModule(ui)
    await useModule(store)
    await useModule(sign)
    // 加载远程模块
    // await useModule(
    //   "https://mqhe2007.github.io/vue-module-module/module/vue-module-module.iife.js"
    // );
    app.use(router).mount("#app");
  },
} as ModuleOptions;
