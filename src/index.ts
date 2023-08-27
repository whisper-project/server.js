// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {apnsToken, pubSubTokenRequest} from './routes.js';
import {getDb} from './db.js'
import {loadSettings} from './settings.js'

const PORT = process.env.PORT || 5001;

loadSettings()
await getDb()

express()
    .use(express.json())
    .use(express.static('static'))
    .post('/apnsToken', asyncWrapper(apnsToken))
    .post('/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .listen(PORT, () => console.log(`Listening on port ${PORT}`))

type Handler = (req: express.Request, res: express.Response) => Promise<void>

function asyncWrapper(handler: Handler) {
    return async (req: express.Request, res: express.Response) => {
        try {
            await handler(req, res)
        }
        catch (error) {
            console.log(`Route handler produced an error: ${error}`)
            res.status(500).send({ status: 'error', reason: `Server error: ${error}`})
        }
    }
}