// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {pubSubTokenRequest, subscribeTokenRequest,} from './routes.js';
import {asyncWrapper, sessionMiddleware} from '../middleware.js'
import {apnsReceivedNotification, apnsToken} from '../routes.js'

export const v1router = express.Router()

v1router
    .post('/apnsToken', asyncWrapper(apnsToken))
    .post('/apnsReceivedNotification', asyncWrapper(apnsReceivedNotification))
    .post('/pubSubTokenRequest', asyncWrapper(pubSubTokenRequest))
    .get('/subscribeTokenRequest', [sessionMiddleware], asyncWrapper(subscribeTokenRequest))
