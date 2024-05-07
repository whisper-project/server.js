// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {
    listenProfileGet,
    listenProfilePost,
    listenProfilePut,
    listenTokenRequest,
    postConversation,
    postUsername,
    pubSubTokenRequest,
    settingsProfileGet,
    settingsProfilePost,
    settingsProfilePut,
    userProfileGet,
    userProfilePost,
    userProfilePut,
    whisperProfileGet,
    whisperProfilePost,
    whisperProfilePut,
} from './routes.js'
import { asyncWrapper, cookieMiddleware, sessionMiddleware } from '../middleware.js'
import { apnsReceivedNotification, apnsToken, logAnomaly, logChannelEvent, logPresenceChunk } from '../routes.js'

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
    .post('/conversation', asyncWrapper(postConversation))
    .post('/username', asyncWrapper(postUsername))
    .post('/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .get('/listenTokenRequest', [cookieMiddleware, sessionMiddleware], asyncWrapper(listenTokenRequest))
