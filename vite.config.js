import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 브이월드(VWorld) 주소검색 REST API 는 브라우저 CORS 를 지원하지 않아
    // 개발 서버가 대신 요청을 중계(프록시)한다. (vworldSdk.js 의 geocodeWithVWorld 참고)
    // ⚠ 프로덕션 배포 시에는 Vite 개발 서버가 없으므로 동일한 역할을 하는
    //   서버/서버리스 프록시를 별도로 구성해야 한다.
    proxy: {
      "/vworld-api": {
        target: "https://api.vworld.kr",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vworld-api/, ""),
      },
    },
  },
});
