// ESLint 평면 설정(flat config) — 프론트엔드(브라우저) + 워커(Cloudflare) 구분
// 실행: npm run lint  /  자동 수정: npm run lint -- --fix
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// 미사용 변수 규칙(공통): 대문자/_ 로 시작하는 값, _ 로 시작하는 인자, catch(e) 는 허용
const noUnusedVars = [
  "warn",
  { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_", caughtErrors: "none" },
];

export default [
  // 검사 제외 대상 (빌드 산출물/의존성)
  { ignores: ["dist/**", "node_modules/**"] },

  // 프론트엔드(React) 소스 — 브라우저 전역
  {
    files: ["src/**/*.{js,jsx}", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": noUnusedVars,
      "react-refresh/only-export-components": "off",
      // 아래 두 규칙은 react-hooks v7 의 신규(react-compiler 계열) 규칙으로,
      // 폼 초기화용 setState-in-effect, ref 동기화(ref.current = state) 등
      // 의도적이고 안전한 기존 패턴을 다수 지적한다. 리팩터링은 별도 과제로 두고
      // 여기서는 경고로만 노출한다.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },

  // 서비스워커 — self/clients 등 워커 전역
  {
    files: ["public/sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": noUnusedVars },
  },

  // Cloudflare Worker(백엔드) — 서비스워커 전역 + fetch/crypto
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": noUnusedVars },
  },
];
