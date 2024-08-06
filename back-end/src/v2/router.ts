// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import { listenTokenRequest, postConversation, postUsername, pubSubTokenRequest } from './routes.js'
import { asyncWrapper, cookieMiddleware, sessionMiddleware } from '../middleware.js'
import {
    apnsReceivedNotification,
    apnsToken,
    logAnomaly,
    logChannelEvent,
    logPresenceChunk,
} from '../routes.js'
import { listTranscripts } from './transcribe.js'
import {
    favoritesProfileGet,
    favoritesProfilePost,
    favoritesProfilePut,
    listenProfileGet,
    listenProfilePost,
    listenProfilePut,
    settingsProfileGet,
    settingsProfilePost,
    settingsProfilePut,
    userProfileGet,
    userProfilePost,
    userProfilePut,
    whisperProfileGet,
    whisperProfilePost,
    whisperProfilePut,
} from './profiles.js'

export const v2router = express.Router()

v2router
    .post('/apnsToken', asyncWrapper(apnsToken))
    .post('/apnsReceivedNotification', asyncWrapper(apnsReceivedNotification))
    .post('/logPresenceChunk', asyncWrapper(logPresenceChunk))
    .post('/logAnomaly', asyncWrapper(logAnomaly))
    .post('/logChannelEvent', asyncWrapper(logChannelEvent))
    .post('/userProfile', asyncWrapper(userProfilePost))
    .put('/userProfile/:profileId', asyncWrapper(userProfilePut))
    .get('/userProfile/:profileId', asyncWrapper(userProfileGet))
    .post('/whisperProfile', asyncWrapper(whisperProfilePost))
    .put('/whisperProfile/:profileId', asyncWrapper(whisperProfilePut))
    .get('/whisperProfile/:profileId', asyncWrapper(whisperProfileGet))
    .post('/listenProfile', asyncWrapper(listenProfilePost))
    .put('/listenProfile/:profileId', asyncWrapper(listenProfilePut))
    .get('/listenProfile/:profileId', asyncWrapper(listenProfileGet))
    .post('/settingsProfile', asyncWrapper(settingsProfilePost))
    .put('/settingsProfile/:profileId', asyncWrapper(settingsProfilePut))
    .get('/settingsProfile/:profileId', asyncWrapper(settingsProfileGet))
    .post('/favoritesProfile', asyncWrapper(favoritesProfilePost))
    .put('/favoritesProfile/:profileId', asyncWrapper(favoritesProfilePut))
    .get('/favoritesProfile/:profileId', asyncWrapper(favoritesProfileGet))
    .post('/conversation', asyncWrapper(postConversation))
    .post('/username', asyncWrapper(postUsername))
    .post('/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .get(
        '/listenTokenRequest',
        [cookieMiddleware, sessionMiddleware],
        asyncWrapper(listenTokenRequest),
    )
    .get('/listTranscripts/:clientId/:conversationId', asyncWrapper(listTranscripts))
