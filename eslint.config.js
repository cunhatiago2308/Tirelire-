// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // French UI text is full of apostrophes; only guard against the characters that really break JSX.
    rules: { "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }] },
  },
]);
