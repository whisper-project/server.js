// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import cookieParser from 'cookie-parser'
import cookieSession from 'cookie-session'
import {getSessionKeys} from './db.js'
import {loadSettings} from './settings.js'

loadSettings()

export const cookieMiddleware = cookieParser()
export const sessionMiddleware = cookieSession({ keys: await getSessionKeys() })

export type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>

export function asyncWrapper(handler: Handler) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            await handler(req, res, next)
        }
        catch (error) {
            console.log(`Route handler produced an error: ${error}`)
            if (!res.headersSent) {
                // make sure we send some response to the client, if it's not already gone
                res.status(500).send({ status: 'error', reason: `Server error: ${error}`})
            }
        }
    }
}
