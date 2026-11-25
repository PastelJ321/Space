import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true },
  plugins: [
    {
      name: "lab-entry",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/") req.url = "/propulsion_lab.html";
          next();
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "index.html",
          source:
            '<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta http-equiv="refresh" content="0;url=./propulsion_lab.html"><title>로켓 추진제 실험</title></head><body><a href="./propulsion_lab.html">로켓 추진제 실험 열기</a></body></html>',
        });
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: "propulsion_lab.html",
      output: {
        codeSplitting: {
          groups: [
            { name: "three-core", test: /three\.core\.js/, priority: 20 },
            {
              name: "three-webgl",
              test: /node_modules[\\/]three/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
