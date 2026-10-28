import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {name:"quiet-chrome-devtools-probe",configureServer(server){server.middlewares.use((request,response,next)=>{
      if (["GET","HEAD"].includes(request.method ?? "") && request.url?.split("?")[0] === "/.well-known/appspecific/com.chrome.devtools.json") {response.statusCode=404;response.setHeader("Cache-Control","no-store");response.end();return;}
      next();
    });}},
    tailwindcss(), reactRouter()
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
