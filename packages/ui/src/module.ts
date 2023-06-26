import { name } from "../package.json";
import { ModuleOptions } from "vue-module-loader/dist/interfaces";
import "./assets/css/tailwind.css";
import * as comP from './components'
export default {
  name,
  install(
    ctx
  ) {
    Object.entries(comP).forEach(([kP,vP])=> {
      Object.entries(vP).forEach(([kC,vC])=> {
          ctx.app.component(kC, vC)
      })
    })
  },
  ...comP
} as ModuleOptions;
