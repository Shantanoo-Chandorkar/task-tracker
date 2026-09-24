import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
    ...nextVitals,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
    ]),
    {
        // Playwright fixtures' `use` param collides with react-hooks' "use*" naming convention.
        files: ['e2e/**', 'playwright.config.js'],
        rules: {
            'react-hooks/rules-of-hooks': 'off',
        },
    },
]);

export default eslintConfig;
