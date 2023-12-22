// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {v1router} from './v1/router.js'
import {v2router} from './v2/router.js'
import {subscribeToPublisher} from './v1/routes.js';
import {listenToPublisher} from './v2/routes.js';
import {asyncWrapper, cookieMiddleware, sessionMiddleware} from './middleware.js'

const PORT = process.env.PORT || 5001;

express()
    .use(express.json())
    .use(express.static('public'))
    .use('/api/v2', v2router)
    .use('/api/v1', v1router)
    .use('/api', v1router)
    .get('/subscribe/:publisherId', [cookieMiddleware, sessionMiddleware], asyncWrapper(subscribeToPublisher))
    .get('/listen/:publisherId', [cookieMiddleware, sessionMiddleware], asyncWrapper(listenToPublisher))
    .listen(PORT, () => console.log(`Listening on port ${PORT}`))
