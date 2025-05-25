import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    stylistic.configs.customize({
        arrowParens: false,
        blockSpacing: true,
        braceStyle: 'stroustrup',
        commaDangle: 'never',
        flat: true,
        indent: 4,
        jsx: false,
        quoteProps: 'consistent-as-needed',
        quotes: 'single',
        semi: true
    }),
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        ignores: ['./dist']
    }
);
