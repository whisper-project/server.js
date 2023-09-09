// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

/* eslint-env node */
module.exports = {
    env: { browser: true },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'react'],
    root: true,
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', {'varsIgnorePattern': '^_', 'argsIgnorePattern': '^_'}]
    }
};
