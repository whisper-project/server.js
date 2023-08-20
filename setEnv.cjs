// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.
//
// Portions of this code may be excerpted under MIT license
// from SDK samples provided by Microsoft.

let fs = require('fs');

const env = process.argv[2] || 'prod'
fs.copyFileSync(`local/${env}.env`, '.env');
console.log(`Installed ${env} environment.`);
