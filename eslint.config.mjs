import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // Enable typed linting for rules that require type information (e.g., @typescript-eslint/no-deprecated)
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    "rules": {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      // Prevent usage of deprecated methods, functions, and properties
      // This helps ensure we don't accidentally use deprecated APIs within our codebase
      "@typescript-eslint/no-deprecated": "error",
      // Prevent direct process.env access outside configuration classes
      // Use configuration classes instead for better testability and multi-tenant support
      "no-restricted-properties": [
        "error",
        {
          "object": "process",
          "property": "env",
          "message": "Use configuration classes instead of direct process.env access. See RuntimeConfiguration, ToolingConfiguration, or ObservabilityConfiguration."
        }
      ]
    }
  },
  // Allow process.env in configuration classes (where env vars are centralized)
  {
    "files": ["**/configuration/**/*.ts"],
    "rules": {
      "no-restricted-properties": "off"
    }
  },
  // Allow process.env and deprecated methods in test files and sample applications
  {
    "files": ["**/tests/**/*.ts", "**/tests-agent/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    "rules": {
      "no-restricted-properties": "off",
      "@typescript-eslint/no-deprecated": "off"
    }
  },
  // Allow deprecated method calls within the Utility class itself (internal implementation)
  {
    "files": ["**/agents-a365-tooling/src/Utility.ts"],
    "rules": {
      "@typescript-eslint/no-deprecated": "off"
    }
  }
);

