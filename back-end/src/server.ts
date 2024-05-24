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
    getTranscriptPage,
    postTranscript,
    resumeTranscriptions,
    suspendTranscriptions,
} from './v2/transcribe.js'
import { Server } from 'node:http'

const PORT = process.env.PORT || 5001

// first thing we do is to pick up any suspended transcriptions
resumeTranscriptions().then((count) => console.log(`Startup: Resumed ${count} transcriptions.`))
// then we do it again after we're sure the other server has shut down
setTimeout(
    () =>
        resumeTranscriptions().then((count) =>
            console.log(`Startup+10: Resumed ${count} transcriptions.`),
        ),
    10 * 1000,
)

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

let server: Server | undefined

if (process.env.NODE_ENV === 'production') {
    server = release.listen(PORT, () => console.log(`Listening (RELEASE) on port ${PORT}`))
} else {
    server = debug.listen(PORT, () => console.log(`Listening (DEBUG) on port ${PORT}`))
}

function shutdown(signal: string) {
    console.warn(`Suspending local transcriptions due to ${signal}...`)
    suspendTranscriptions().then((count) => console.log(`Suspended ${count} transcriptions.`))
    if (server) {
        console.warn(`Stopping webserver due to ${signal}...`)
        server.close((err) => {
            server = undefined
            if (err) {
                console.error(`The webserver was already stopped.`)
            } else {
                console.log(`The webserver stopped cleanly.`)
            }
        })
    }
}

process.once('SIGTERM', () => {
    shutdown('SIGTERM')
})
process.once('SIGINT', () => {
    shutdown('SIGINT')
})
