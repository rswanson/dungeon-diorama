import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/", "coverage/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/client/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/server/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
