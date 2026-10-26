import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        server: {
            deps: {
                inline: ['@material/material-color-utilities'],
            },
        },
    },
});
