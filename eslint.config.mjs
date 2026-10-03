import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // One-off investigation output and local tool state are not application source.
    "auto_match_diagnosis_*/**",
    "scratch/**",
    "supabase/.temp/**",
    ".superpowers/**",
  ]),
  {
    files: ["scripts/**/*.{js,cjs,mjs}"],
    rules: {
      // Guard/test scripts intentionally use CommonJS and sandboxed `module` objects.
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);

export default eslintConfig;
