/** @type {import('tailwindcss').Config} */
// =============================================================================
// Tailwind theme — 모든 값은 src/styles/theme.css 의 CSS 변수(var(--...))를 참조합니다.
// HEX 코드를 직접 쓰지 않으므로, 다크모드/테마 변경 시 theme.css 만 바꾸면 됩니다.
// =============================================================================
import path from "path";
import { fileURLToPath } from "url";

// content 글롭을 이 설정 파일 위치 기준 절대경로로 고정 (실행 cwd 와 무관하게 동작)
const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    path.join(dir, "index.html"),
    path.join(dir, "src/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          100: "var(--color-gray-100)",
          200: "var(--color-gray-200)",
          300: "var(--color-gray-300)",
          400: "var(--color-gray-400)",
          500: "var(--color-gray-500)",
          600: "var(--color-gray-600)",
          700: "var(--color-gray-700)",
          800: "var(--color-gray-800)",
          900: "var(--color-gray-900)",
        },
        primary: {
          100: "var(--color-primary-100)",
          200: "var(--color-primary-200)",
          300: "var(--color-primary-300)",
          400: "var(--color-primary-400)",
          DEFAULT: "var(--color-primary)",
        },
        red: { 100: "var(--color-red-100)" },
        orange: { 100: "var(--color-orange-100)" },
        purple: { 100: "var(--color-purple-100)" },
        yellow: { 100: "var(--color-yellow-100)" },
        icon: { 100: "var(--color-icon-100)" },

        // Semantic
        list: {
          "bg-100": "var(--color-list-bg-100)",
          "bg-200": "var(--color-list-bg-200)",
          "line-100": "var(--color-list-line-100)",
          "line-200": "var(--color-list-line-200)",
        },
        popup: {
          "bg-100": "var(--color-popup-bg-100)",
          "bg-200": "var(--color-popup-bg-200)",
          "line-100": "var(--color-popup-line-100)",
          "line-200": "var(--color-popup-line-200)",
        },

        // Role aliases
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        danger: "var(--color-danger)",
        warning: "var(--color-warning)",
      },

      fontFamily: {
        sans: "var(--font-family-base)",
        base: "var(--font-family-base)",
      },

      fontWeight: {
        regular: "var(--font-weight-regular)",
        bold: "var(--font-weight-bold)",
      },

      fontSize: {
        title: ["var(--font-size-title)", { lineHeight: "var(--line-height-title)" }],
        header: ["var(--font-size-header)", { lineHeight: "var(--line-height-header)" }],
        body1: ["var(--font-size-body1)", { lineHeight: "var(--line-height-body1)" }],
        body2: ["var(--font-size-body2)", { lineHeight: "var(--line-height-body2)" }],
        caption: ["var(--font-size-caption)", { lineHeight: "var(--line-height-caption)" }],
      },

      letterSpacing: {
        base: "var(--letter-spacing-base)",
      },

      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },

      spacing: {
        "token-1": "var(--space-1)",
        "token-2": "var(--space-2)",
        "token-3": "var(--space-3)",
        "token-4": "var(--space-4)",
        "token-5": "var(--space-5)",
        "token-6": "var(--space-6)",
        "token-8": "var(--space-8)",
      },

      boxShadow: {
        badge: "var(--shadow-badge)",
        popup: "var(--shadow-popup)",
      },
    },
  },
  plugins: [],
};
