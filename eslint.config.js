import pluginSecurity from "eslint-plugin-security";

export default [
  pluginSecurity.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      "functions/coverage/**",
      "test-results/**",
      "playwright-report/**",
      "**/.wrangler/**"
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        // Global variables for browser/node/workers
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        confirm: "readonly",
        AbortController: "readonly",
        crypto: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        URL: "readonly",
        Buffer: "readonly"
      }
    },
    rules: {
      // Custom overrides if needed
      "security/detect-object-injection": "off" // Frequently produces false positives for dynamic coordinate queries, gate if needed
    }
  }
];
