import type { UserConfig } from "vite";
export default {
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "^/api/session/.*/events": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
  publicDir: 'public',
  // Silence Sass deprecation warnings. (https://github.com/twbs/bootstrap/issues/40962)
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["import", "color-functions", "global-builtin", "if-function"],
      },
    },
  },
} satisfies UserConfig;
