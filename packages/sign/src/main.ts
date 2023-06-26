import * as Vue from "vue";
import { useModule } from "vue-module-loader";
import localModule from "./module";
import { createApp } from "vue";
import App from "@/App.vue";
import router from "@/router";
useModule({
  name: 'layout',
  install(
    ctx
  ) {
    const app = createApp(App);
    ctx.app = app;
    app.use(router);
    app.mount("#app");
  },
}, { Vue }).then(r => {
  useModule(localModule)
});
