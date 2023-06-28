import { defineConfig, UserConfig } from "vite";

import {resolve} from 'path'
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
function camelize(str) {
  return (str + "").replace(/-\D/g, function (match) {
    return match.charAt(1).toUpperCase();
  });
}
export default defineConfig(({ command, mode })=> {
  const config: UserConfig = {
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    plugins: [
          vue(),
          Components({
            include: [/\.vue$/, /\.vue\?vue/],
          }),
    ],
  };
  if (command === "build" && process.env.BUILD_MODULE === "1") {
    config.define = {
      "process.env.NODE_ENV": '"production"',
    };
    config.build = {
      outDir: "./dist/module",
      sourcemap: "inline",
      lib: {
        entry: resolve(__dirname, "src/module.js"),
        // 格式必须为iife
        formats: ["iife"],
        name: camelize(name),
      },
      minify: false,
      rollupOptions: {
        // 为了使用同一vue对象，所有模块必须外置化vue
        external: ["vue"],
      },
    };
  }
  return config;
})
