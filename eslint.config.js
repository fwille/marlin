// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Cosmetic — flags literal quotes/apostrophes in JSX text, doesn't catch real bugs.
      "react/no-unescaped-entities": "off",
    },
  },
]);
