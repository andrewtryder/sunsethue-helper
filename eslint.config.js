const pluginSecurity = require("eslint-plugin-security");

module.exports = [
  pluginSecurity.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      "functions/coverage/**",
      "test-results/**",
      "playwright-report/**"
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        // Global variables for browser/node
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
        AbortController: "readonly"
      }
    },
    rules: {
      // Custom overrides if needed
      "security/detect-object-injection": "off" // Frequently produces false positives for dynamic coordinate queries, gate if needed
    }
  }
];
