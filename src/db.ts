// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {createClient, RedisClientType} from 'redis'
import {getSettings} from './settings.js'

let loadedClient: RedisClientType | undefined

export async function getDb() {
    if (loadedClient) {
        return loadedClient
    }
    const config = getSettings()
    loadedClient = createClient({ url: config.dbUrl })
    await loadedClient.connect()
    return loadedClient
}

export interface ClientData {
    id: string,
    deviceId?: string,
    token?: string,
    tokenDate?: number
    secret?: string,
    secretDate?: number,
    pushId?: string,
}

export async function getClientData(clientKey: string): Promise<ClientData> {
    const rc = await getDb()
    const existing: {[index:string]: string | number} = await rc.hGetAll(clientKey)
    if (!existing) {
        throw Error(`No data found for ${clientKey}`)
    }
    if (!existing?.id) {
        throw Error(`No id found in data for ${clientKey}: ${JSON.stringify(existing)}`)
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
    await rc.hSet(clientKey, update)
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
    const existing: {[index:string]: string | number} = await db.hGetAll(requestKey)
    if (!existing) {
        throw Error(`No APNs request found for key ${requestKey}`)
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
    await rc.hSet(requestKey, update)
}
