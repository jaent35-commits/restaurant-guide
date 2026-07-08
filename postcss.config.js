import path from "path";
import { fileURLToPath } from "url";

// Tailwind 가 config 를 process.cwd() 에서 찾으므로, 실행 위치와 무관하게
// 이 폴더의 tailwind.config.js 를 쓰도록 절대경로로 명시한다.
const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(dir, "tailwind.config.js") },
    autoprefixer: {},
  },
};
