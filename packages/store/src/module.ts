import { name } from "../package.json";
import { ModuleOptions } from "vue-module-loader/dist/interfaces";
import "./assets/css/tailwind.css";
import { routes } from "./router";
export default {
  name,
  install(
    ctx
  ) {
    routes.forEach(item => {
      ctx.router.addRoute(item);
    });
  },
} as ModuleOptions;
