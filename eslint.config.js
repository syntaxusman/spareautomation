import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".agents", ".claude", "routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // These colocated hooks and style helpers are intentional public APIs
          // used by the component modules; listing them keeps new accidental
          // non-component exports visible without generating baseline noise.
          allowExportNames: [
            "SUBMISSION_TYPE_LABELS",
            "badgeVariants",
            "buttonVariants",
            "defaultFor",
            "formatBytes",
            "formatDate",
            "formatDateTime",
            "formatRelative",
            "humaniseAction",
            "navigationMenuTriggerStyle",
            "toggleVariants",
            "useCmsTheme",
            "useCommandPalette",
            "useContent",
            "useEditable",
            "useEditMode",
            "useFormField",
            "useSidebar",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    rules: {
      "prettier/prettier": "off",
    },
  },
);
