// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import {createClient} from 'redis';

import {apnsToken} from './routes.js';

const PORT = process.env.PORT || 5001;

const app = express()
    .use(express.json())
    .post('/apnsToken', apnsToken)

export const rc = createClient({ url: process.env['REDISCLOUD_URL'] })
rc.on('error', err => console.log(`Redis client error:`, err))

await rc.connect()

app.listen(PORT, () => console.log(`Listening on port ${PORT}`))
