import js from '@eslint/js';
import json from '@eslint/json';
import jsonc from 'eslint-plugin-jsonc';
import markdown from '@eslint/markdown';
import stylistic from '@stylistic/eslint-plugin';
import ts from 'typescript-eslint';
import yml from 'eslint-plugin-yml';

export default ts.config([
    {
        name: 'global-ignore',
        ignores: ['./dist', '**/package-lock.json', '.kiro/**/*.md']
    },
    {
        // https://github.com/eslint-stylistic/eslint-stylistic
        // https://github.com/typescript-eslint/typescript-eslint
        name: 'javascript-typescript',
        files: ['**/*.js', '**/*.ts'],
        extends: [
            js.configs.recommended,
            stylistic.configs.customize({
                arrowParens: false,
                blockSpacing: true,
                braceStyle: 'stroustrup',
                commaDangle: 'never',
                indent: 4,
                jsx: false,
                quoteProps: 'consistent-as-needed',
                quotes: 'single',
                semi: true,
                severity: 'error'
            }),
            ts.configs.strict,
            ts.configs.stylistic
        ]
    },
    {
        // https://github.com/eslint/json
        // https://github.com/ota-meshi/eslint-plugin-jsonc
        name: 'json',
        files: ['**/*.json'],
        language: 'json/json',
        extends: [json.configs.recommended, jsonc.configs['flat/recommended-with-json']]
    },
    {
        // https://github.com/eslint/json
        // https://github.com/ota-meshi/eslint-plugin-jsonc
        name: 'jsonc',
        files: ['**/*.jsonc', './.vscode/*.json', '**/tsconfig.json'],
        language: 'json/jsonc',
        extends: [json.configs.recommended, jsonc.configs['flat/recommended-with-jsonc']]
    },
    {
        // https://github.com/eslint/markdown
        name: 'markdown',
        files: ['**/*.md'],
        language: 'markdown/gfm',
        extends: [markdown.configs.recommended]
    },
    {
        // https://github.com/ota-meshi/eslint-plugin-yml
        name: 'yml',
        files: ['**/*.yml', '**/*.yaml'],
        extends: [yml.configs['flat/recommended']]
    }
]);
