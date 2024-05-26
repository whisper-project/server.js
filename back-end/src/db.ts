// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { createClient } from 'redis'
import { getSettings } from './settings.js'
import { makeNonce } from './auth.js'

interface loadedClient {
    client: ReturnType<typeof createClient>
    connectionId: number
}

const loadedClients: { [name: string]: loadedClient } = {}

export let dbKeyPrefix: string = 'u:'

export async function getDbClient(name: string = 'default') {
    if (loadedClients[name]) {
        return loadedClients[name].client
    }
    const config = getSettings()
    dbKeyPrefix = config.dbKeyPrefix
    const rc = createClient({ url: config.dbUrl })
    await rc.connect()
    const id = await rc.clientId()
    loadedClients[name] = { client: rc, connectionId: id }
    return rc
}

export async function unblockDbClient(name: string) {
    if (name === 'default') {
        throw Error(`Can't unblock the default database client`)
    }
    if (!loadedClients[name]) {
        console.warn(`Ignoring attempt to unblock unknown database client ${name}`)
        return false
    }
    const rc = await getDbClient()
    const id = loadedClients[name].connectionId
    try {
        const result = await rc.sendCommand(['CLIENT', 'UNBLOCK', id.toString()])
        if (result === 1) {
            return true
        }
        console.warn(`REDIS reports that client ${id} was not blocked`)
        return false
    } catch (err) {
        console.warn(`REDIS error trying to unblock client ${id}: ${err}`)
        return false
    }
}

export async function getSessionKeys(doRotate = false) {
    const rc = await getDbClient()
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
    const rc = await getDbClient()
    const key = dbKeyPrefix + 'presenceLogging'
    const val = await rc.get(key)
    return val === 'true'
}

export async function setPresenceLogging(doLogging: boolean) {
    const rc = await getDbClient()
    const key = dbKeyPrefix + 'presenceLogging'
    await rc.set(key, doLogging ? 'true' : 'false')
}
