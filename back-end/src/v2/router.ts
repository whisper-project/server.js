// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {
    pubSubTokenRequest,
    listenTokenRequest,
    userProfilePost,
    userProfilePut,
    whisperProfilePut,
    whisperProfilePost, whisperProfileGet, userProfileGet, listenProfilePost, listenProfilePut, listenProfileGet,
} from './routes.js'
import {asyncWrapper, sessionMiddleware} from '../middleware.js'
import {apnsReceivedNotification, apnsToken} from '../routes.js'

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
    .post('/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .get('/listenTokenRequest', [sessionMiddleware], asyncWrapper(listenTokenRequest))
