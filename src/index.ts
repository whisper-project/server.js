// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {apnsToken} from './routes.js';
import {getDb} from './db.js'
import {loadSettings} from './settings.js'

const PORT = process.env.PORT || 5001;

loadSettings()
await getDb()

express()
    .use(express.json())
    .post('/apnsToken', apnsToken)
    .listen(PORT, () => console.log(`Listening on port ${PORT}`))
