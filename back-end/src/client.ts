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

export async function getClientData(clientKey: string) {
    const rc = await getDb()
    const existing: {[index:string]: string | number} = await rc.hGetAll(dbKeyPrefix + clientKey)
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

export async function setClientData(clientKey: string, clientData: ClientData) {
    const rc = await getDb()
    await rc.hSet(dbKeyPrefix + clientKey, { ...clientData })
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
    if (!clientChanged && received.appInfo !== existing?.appInfo) {
        clientChanged = true
        changeReason = "new build data from existing"
    }
    return {clientChanged, changeReason} as HasClientChanged
}

export interface ProfileData {
    id: string
    name?: string
    password?: string
    whisperProfile?: string
}

export async function getProfileData(id: string) {
    const rc = await getDb()
    const profileKey = dbKeyPrefix + `pro:${id}`
    const dbData: {[index:string]: string} = await rc.hGetAll(profileKey)
    if (!dbData?.id) {
        return undefined
    }
    return {
        id: dbData.id,
        name: dbData.name,
        password: dbData.password,
        whisperProfile: dbData?.whisperProfile
    } as ProfileData
}

export async function saveProfileData(profileData: ProfileData) {
    const rc = await getDb()
    const profileKey = dbKeyPrefix + `pro:${profileData.id}`
    await rc.hSet(profileKey, { ...profileData })
}
