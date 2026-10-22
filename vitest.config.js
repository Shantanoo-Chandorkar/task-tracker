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
        // Full-suite jsdom creation (245 files) can starve a fast test past the 5s default under load.
        testTimeout: 15000,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, '.'),
        },
    },
});
