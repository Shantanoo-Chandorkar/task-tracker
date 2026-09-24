import { defineConfig, defaultExclude } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: [],
        // e2e/*.spec.js are Playwright specs, not Vitest ones - their test.describe() throws outside Playwright.
        exclude: [...defaultExclude, 'e2e/**'],
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, '.'),
        },
    },
});
