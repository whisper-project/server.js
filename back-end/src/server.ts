// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import { v1router } from './v1/router.js'
import { v2router } from './v2/router.js'
import { subscribeToPublisher } from './v1/routes.js'
import { listenToConversation } from './v2/routes.js'
import { asyncWrapper, cookieMiddleware, sessionMiddleware } from './middleware.js'
import {
    SERVER_ID,
    getTranscriptPage,
    postTranscript,
    resumeTranscriptions,
    suspendTranscriptions,
} from './v2/transcribe.js'
import { Server } from 'node:http'
import { randomInt } from 'node:crypto'

const PORT = process.env.PORT || randomInt(5001, 5999)

const release = express()
    .use(express.json())
    .use(express.static('public'))
    .use('/api/v2', v2router)
    .use('/api/v1', v1router)
    .use('/api', v1router)
    .get('/transcript/:conversationId/:transcriptId', asyncWrapper(getTranscriptPage))
    .get(
        '/subscribe/:publisherId',
        [cookieMiddleware, sessionMiddleware],
        asyncWrapper(subscribeToPublisher),
    )
    .get(
        '/listen/:conversationId',
        [cookieMiddleware, sessionMiddleware],
        asyncWrapper(listenToConversation),
    )
    .get(
        '/listen/:conversationId/*',
        [cookieMiddleware, sessionMiddleware],
        asyncWrapper(listenToConversation),
    )

const debug = release.post('/test/transcript', asyncWrapper(postTranscript))

function main() {
    console.log(`Starting server ${SERVER_ID}...`)
    // first thing we do is to start picking up suspended transcriptions
    const transcriber = resumeTranscriptions()
    // then we run the appropriate webserver, cleaning up on signals and crashes
    let server: Server | undefined
    process.once('SIGTERM', () => shutdown('SIGTERM', transcriber, server))
    process.once('SIGINT', () => shutdown('SIGINT', transcriber, server))
    try {
        if (process.env.NODE_ENV === 'production') {
            server = release.listen(PORT, () =>
                console.log(`Server ${SERVER_ID} listening (RELEASE) on port ${PORT}`),
            )
        } else {
            server = debug.listen(PORT, () =>
                console.log(`Server ${SERVER_ID} listening (DEBUG) on port ${PORT}`),
            )
        }
    } catch (err) {
        shutdown(`error: ${err}`, transcriber, server)
    }
}

function shutdown(signal: string, transcriber: Promise<void>, server: Server | undefined) {
    let exitStatus = 0
    console.warn(`Shutting down Server ${SERVER_ID} due to ${signal}...`)
    const suspend = suspendTranscriptions(transcriber)
    const notifyAndExit = () => {
        console.log(`Terminating Server ${SERVER_ID} after shutdown`)
        process.exit(exitStatus)
    }
    if (server) {
        server.close((err) => {
            if (err) {
                console.error(`Server ${SERVER_ID}: webserver was already stopped.`)
                exitStatus = 1
            } else {
                console.log(`Server ${SERVER_ID}: webserver stopped cleanly.`)
            }
            suspend.then(notifyAndExit)
        })
    } else {
        suspend.then(notifyAndExit)
    }
}

main()
