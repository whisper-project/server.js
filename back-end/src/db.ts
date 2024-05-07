// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { createClient, RedisClientType } from 'redis'
import { getSettings } from './settings.js'
import { makeNonce } from './auth.js'

let loadedClient: RedisClientType | undefined
export let dbKeyPrefix: string = 'u:'

export async function getDb() {
    if (loadedClient) {
        return loadedClient
    }
    const config = getSettings()
    dbKeyPrefix = config.dbKeyPrefix
    loadedClient = createClient({ url: config.dbUrl })
    await loadedClient.connect()
    return loadedClient
}

export async function getSessionKeys(doRotate = false) {
    const rc = await getDb()
    const sessionKey = dbKeyPrefix + 'sessionKeys'
    let stored = await rc.lRange(sessionKey, 0, -1)
    if (stored.length === 0 || doRotate) {
        const secret = await makeNonce()
        stored = [secret, ...stored]
        await rc.lPush(sessionKey, secret)
    }
    return stored
}

export async function getPresenceLogging() {
    const rc = await getDb()
    const key = dbKeyPrefix + 'presenceLogging'
    const val = await rc.get(key)
    return val === 'true'
}

export async function setPresenceLogging(doLogging: boolean) {
    const rc = await getDb()
    const key = dbKeyPrefix + 'presenceLogging'
    await rc.set(key, doLogging ? 'true' : 'false')
}
