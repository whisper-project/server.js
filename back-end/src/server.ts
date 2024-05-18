// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import { v1router } from './v1/router.js'
import { v2router } from './v2/router.js'
import { subscribeToPublisher } from './v1/routes.js'
import { listenToConversation } from './v2/routes.js'
import { asyncWrapper, cookieMiddleware, sessionMiddleware } from './middleware.js'
import { getTranscriptPage, postTranscript } from './v2/transcribe.js'

const PORT = process.env.PORT || 5001

const release = express()
    .use(express.json())
    .use(express.static('public'))
    .use('/api/v2', v2router)
    .use('/api/v1', v1router)
    .use('/api', v1router)
    .get('/transcript/:conversationId/:transcriptId', asyncWrapper(getTranscriptPage))
    .get('/subscribe/:publisherId', [cookieMiddleware, sessionMiddleware], asyncWrapper(subscribeToPublisher))
    .get('/listen/:conversationId', [cookieMiddleware, sessionMiddleware], asyncWrapper(listenToConversation))
    .get('/listen/:conversationId/*', [cookieMiddleware, sessionMiddleware], asyncWrapper(listenToConversation))

const debug = release
    .post('/test/transcript', asyncWrapper(postTranscript))

if (process.env.NODE_ENV === 'production') {
    release
        .listen(PORT, () => console.log(`Listening (RELEASE) on port ${PORT}`))
} else {
    debug
        .listen(PORT, () => console.log(`Listening (DEBUG) on port ${PORT}`))
}
