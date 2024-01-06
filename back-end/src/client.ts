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

export interface HasClientChanged {
    clientChanged: boolean
    changeReason: string
}

export async function hasClientChanged(clientKey: string, received: ClientData) {
    const existing = await getClientData(clientKey)
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
    if (!clientChanged && received.userName !== existing?.userName) {
        clientChanged = true
        changeReason = "new user data from existing"
    }
    if (!clientChanged && received.appInfo !== existing?.appInfo) {
        clientChanged = true
        changeReason = "new build data from existing"
    }
    return {clientChanged, changeReason} as HasClientChanged
}