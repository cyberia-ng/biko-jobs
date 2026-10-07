import type { UserConfig } from "vite";
export default {
  build: {
    sourcemap: true,
  },
  // Silence Sass deprecation warnings. (https://github.com/twbs/bootstrap/issues/40962)
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["import", "color-functions", "global-builtin", "if-function"],
      },
    },
  },
} satisfies UserConfig;
