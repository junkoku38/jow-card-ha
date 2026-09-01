import js from "@eslint/js";

export default [
  {
    files: ["weekly-menu-card.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        customElements: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        TouchEvent: "readonly",
        DragEvent: "readonly",
        HTMLElement: "readonly",
        CustomEvent: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
];