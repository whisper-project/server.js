// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {createClient, RedisClientType} from 'redis'
import {getSettings} from './settings.js'
import {makeNonce} from './auth.js'

let loadedClient: RedisClientType | undefined
let dbKeyPrefix: string = 'u:'

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

export interface ClientData {
    id: string,
    deviceId?: string,
    token?: string,
    tokenDate?: number
    lastSecret?: string
    secret?: string,
    secretDate?: number,
    pushId?: string,
    userName?: string,
    appInfo?: string,
}

export async function getClientData(clientKey: string) {
    const rc = await getDb()
    const existing: {[index:string]: string | number} = await rc.hGetAll(dbKeyPrefix + clientKey)
    if (!existing?.id) {
        return undefined
    }
    if (existing?.tokenDate === "string") {
        existing.tokenDate = parseInt(existing.tokenDate)
    }
    if (typeof existing?.secretDate === "string") {
        existing.secretDate = parseInt(existing.secretDate)
    }
    return existing as unknown as ClientData
}

export async function setClientData(clientKey: string, clientData: ClientData) {
    const update = {}
    for (const key in clientData) {
        update[key] = clientData[key].toString()
    }
    const rc = await getDb()
    await rc.hSet(dbKeyPrefix + clientKey, update)
}

export interface ApnsRequestData {
    id: string,
    clientKey: string,
    status: number,
    devId?: string,
    reason?: string,
    timestamp?: number
}

export async function getApnsRequestData(requestKey: string) {
    const db = await getDb()
    const existing: {[index:string]: string | number} = await db.hGetAll(dbKeyPrefix + requestKey)
    if (!existing?.id) {
        return undefined
    }
    if (typeof existing?.status === 'string') {
        existing.status = parseInt(existing.status)
    }
    return existing as unknown as ApnsRequestData
}

export async function setApnsRequestData(requestKey: string, data: ApnsRequestData) {
    const update = {}
    for (const key in data) {
        update[key] = data[key].toString()
    }
    const rc = await getDb()
    await rc.hSet(dbKeyPrefix + requestKey, update)
}
