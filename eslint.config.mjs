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
    {
        // Enforces the modules/ DAG so each module stays extractable into its own service later.
        files: ['modules/**/*.{js,jsx}'],
        rules: {
            'import/no-restricted-paths': [
                'error',
                {
                    zones: [
                        {
                            target: './modules/tasks',
                            from: ['./modules/habits', './modules/timer', './modules/analytics'],
                            message:
                                'modules/tasks may only import lib/ - it must not depend on habits, timer or analytics.',
                        },
                        {
                            target: './modules/habits',
                            from: './modules/tasks',
                            except: ['./index.js', './errors.js'],
                            message:
                                'habits may only import tasks via its index.js barrel or errors.js, never its internals.',
                        },
                        {
                            target: './modules/habits',
                            from: ['./modules/timer', './modules/analytics'],
                            message: 'habits must not depend on timer or analytics.',
                        },
                        {
                            target: './modules/timer',
                            from: './modules/tasks',
                            except: ['./index.js', './errors.js'],
                            message:
                                'timer may only import tasks via its index.js barrel or errors.js, never its internals.',
                        },
                        {
                            target: './modules/timer',
                            from: ['./modules/habits', './modules/analytics'],
                            message: 'timer must not depend on habits or analytics.',
                        },
                        {
                            target: './modules/analytics',
                            from: './modules/tasks',
                            message:
                                'analytics may depend on habits and timer, but never on tasks directly.',
                        },
                        {
                            target: './modules/analytics',
                            from: ['./modules/habits', './modules/timer'],
                            except: ['./index.js'],
                            message:
                                'analytics may only import the habits/timer index.js barrels, never their internals.',
                        },
                    ],
                },
            ],
        },
    },
]);

export default eslintConfig;
