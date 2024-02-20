// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {dbKeyPrefix, getDb} from './db.js'

export interface ClientData {
    id: string,
    deviceId?: string,
    token?: string,
    tokenDate?: number
    lastSecret?: string
    secret?: string,
    secretDate?: number,
    pushId?: string,
    appInfo?: string,
    userName?: string,      // used in v1
    profileId?: string,     // used in v2
    profileTimestamp?: number
}

export async function getClientData(id: string) {
    const rc = await getDb()
    const clientKey = dbKeyPrefix + `cli:${id}`
    const existing: {[index:string]: string | number} = await rc.hGetAll(clientKey)
    if (!existing?.id) {
        return undefined
    }
    if (typeof existing?.tokenDate === "string") {
        existing.tokenDate = parseInt(existing.tokenDate)
    }
    if (typeof existing?.secretDate === "string") {
        existing.secretDate = parseInt(existing.secretDate)
    }
    if (typeof existing?.profileTimestamp === 'string') {
        existing.profileTimestamp = parseInt(existing.profileTimestamp)
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
    let changeReason = ""
    if (!existing) {
        clientChanged = true
        changeReason = "APNS token from new"
    }
    if (!clientChanged && received.lastSecret !== existing?.lastSecret) {
        clientChanged = true
        changeReason = "unconfirmed secret from existing"
    }
    if (!clientChanged && received.token !== existing?.token) {
        clientChanged = true
        changeReason = "new APNS token from existing"
    }
    if (!clientChanged && received.appInfo !== existing?.appInfo) {
        clientChanged = true
        changeReason = "new build data from existing"
    }
    return {clientChanged, changeReason} as HasClientChanged
}
