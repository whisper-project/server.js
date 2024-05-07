// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { dbKeyPrefix, getDb, getPresenceLogging } from './db.js'

export interface ClientData {
    id: string,
    deviceId?: string,
    token?: string,
    lastSecret?: string
    secret?: string,
    secretDate?: number,
    pushId?: string,
    appInfo?: string,
    userName?: string,      // used in v1 & v2
    profileId?: string,     // used in v2
    lastLaunch?: number,
    isPresenceLogging?: number,
}

export async function getClientData(id: string) {
    const rc = await getDb()
    const clientKey = dbKeyPrefix + `cli:${id}`
    const existing: { [index: string]: string | number } = await rc.hGetAll(clientKey)
    if (!existing?.id) {
        return undefined
    }
    if (typeof existing?.secretDate === 'string') {
        existing.secretDate = parseInt(existing.secretDate)
    }
    if (typeof existing?.lastLaunch === 'string') {
        existing.lastLaunch = parseInt(existing.lastLaunch)
    }
    return existing as unknown as ClientData
}

export async function setClientData(clientData: ClientData) {
    const rc = await getDb()
    const clientKey = dbKeyPrefix + `cli:${clientData.id}`
    await rc.hSet(clientKey, { ...clientData })
}

export interface HasClientChanged {
    clientChanged: boolean
    changeReason: string
}

export async function hasClientChanged(id: string, received: ClientData) {
    const existing = await getClientData(id)
    // see refreshSecret for explanation of logic around lastSecret
    let clientChanged = false
    let changeReason = ''
    if (!existing) {
        clientChanged = true
        changeReason = 'APNS token from new'
    }
    if (!clientChanged && received.lastSecret !== existing?.lastSecret) {
        clientChanged = true
        changeReason = 'unconfirmed secret from existing'
    }
    if (!clientChanged && received.token !== existing?.token) {
        clientChanged = true
        changeReason = 'new APNS token from existing'
    }
    if (!clientChanged && received.appInfo !== existing?.appInfo) {
        clientChanged = true
        changeReason = 'new build data from existing'
    }
    if (!clientChanged && received.isPresenceLogging == 0 && await getPresenceLogging()) {
        clientChanged = true
        changeReason = 'logging state OFF from existing'
    }
    return { clientChanged, changeReason } as HasClientChanged
}

export async function isApnsPostRepeat(received: ClientData) {
    const rc = await getDb()
    const key = dbKeyPrefix + `apns:${received.id}|${received.token}`
    const existing = await rc.set(key, Date.now(), { NX: true, PX: 250, GET: true })
    return existing !== null
}
