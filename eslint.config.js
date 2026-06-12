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

      // Upgrade warn → error: unused vars and loose equality are bugs, not style.
      "@typescript-eslint/no-unused-vars": ["error", {
        vars: "all", args: "none", ignoreRestSiblings: true, caughtErrors: "all",
      }],
      "eqeqeq": ["error", "smart"],

      // Enforce const where the binding is never reassigned.
      "prefer-const": "error",

      // Flag leftover debug logs; console.warn/error are legitimate for error reporting.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]);
