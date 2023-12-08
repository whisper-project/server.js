// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.
import {getSettings} from '../settings.js'
import * as Ably from 'ably/promises.js'

export async function createAblyPublishTokenRequest(clientId: string) {
    const config = getSettings()
    const ably = new Ably.Rest({ key: config.ablyPublishKey })
    const tokenCaps = {}
    tokenCaps[`${clientId}:whisper`] = ['publish', 'subscribe', 'presence']
    const tokenParams = {
        clientId,
        capability: JSON.stringify(tokenCaps)
    }
    return await ably.auth.createTokenRequest(tokenParams)
}

export async function createAblySubscribeTokenRequest(clientId: string, publisherId: string) {
    const config = getSettings()
    const ably = new Ably.Rest({ key: config.ablyPublishKey })
    const tokenCaps = {}
    tokenCaps[`${publisherId}:whisper`] = ['publish', 'subscribe', 'presence']
    const tokenParams = {
        clientId,
        capability: JSON.stringify(tokenCaps)
    }
    return await ably.auth.createTokenRequest(tokenParams)
}
