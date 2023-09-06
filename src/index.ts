// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import cookieSession from 'cookie-session'

import {
    apnsReceivedNotification,
    apnsToken,
    pubSubTokenRequest,
    subscribeTokenRequest,
    subscribeToPublisher
} from './routes.js';
import {getDb, getSessionKeys} from './db.js'
import {loadSettings} from './settings.js'

const PORT = process.env.PORT || 5001;

loadSettings()
await getDb()

const sessionMiddleware = cookieSession({ keys: await getSessionKeys() })

express()
    .use(express.json())
    .use(express.static('static'))
    .post('/api/apnsToken', asyncWrapper(apnsToken))
    .post('/api/apnsReceivedNotification', asyncWrapper(apnsReceivedNotification))
    .post('/api/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .get('/subscribe/:publisherId', sessionMiddleware, asyncWrapper(subscribeToPublisher))
    .get('/api/subscribeTokenRequest', sessionMiddleware, asyncWrapper(subscribeTokenRequest))
    .listen(PORT, () => console.log(`Listening on port ${PORT}`))

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>

function asyncWrapper(handler: Handler) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            await handler(req, res, next)
        }
        catch (error) {
            console.log(`Route handler produced an error: ${error}`)
            res.status(500).send({ status: 'error', reason: `Server error: ${error}`})
        }
    }
}