// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {
    pubSubTokenRequest,
    listenTokenRequest,
    userProfilePost,
    userProfilePut,
    whisperProfilePut,
    whisperProfilePost,
    whisperProfileGet,
    userProfileGet,
    listenProfilePost,
    listenProfilePut,
    listenProfileGet,
    postConversation, postUsername, settingsProfilePost, settingsProfilePut, settingsProfileGet,
} from './routes.js'
import { asyncWrapper, cookieMiddleware, sessionMiddleware } from '../middleware.js'
import { apnsReceivedNotification, apnsToken } from '../routes.js'

export const v2router = express.Router()

v2router
    .post('/apnsToken', asyncWrapper(apnsToken))
    .post('/apnsReceivedNotification', asyncWrapper(apnsReceivedNotification))
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
