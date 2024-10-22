// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { dbKeyPrefix, getDbClient } from './db.js'
import { getClientData } from './client.js'

export interface ProfileData {
    id: string
    lastUsed?: number
    name?: string
    password?: string
    whisperTimestamp?: string
    whisperProfile?: string
    listenTimestamp?: string
    listenProfile?: string
    settingsVersion?: number
    settingsETag?: string
    settingsProfile?: string
    favoritesTimestamp?: string
    favoritesProfile?: string
}

export async function getProfileData(id: string) {
    const rc = await getDbClient()
    const profileKey = dbKeyPrefix + `pro:${id}`
    const dbData: { [index: string]: string } = await rc.hGetAll(profileKey)
    if (!dbData?.id) {
        return undefined
    }
    return {
        ...dbData,
        id: id,
        lastUsed: parseInt(dbData?.lastUsed ? dbData.lastUsed : Date.now().toString()),
        settingsVersion: parseInt(dbData?.settingsVersion ? dbData.settingsVersion : "1"),
    } as ProfileData
}

export async function saveProfileData(profileData: ProfileData) {
    const rc = await getDbClient()
    profileData.lastUsed = Date.now()
    const profileKey = dbKeyPrefix + `pro:${profileData.id}`
    await rc.hSet(profileKey, { ...profileData })
}

export async function getProfileClients(id: string) {
    const rc = await getDbClient()
    const clientsKey = dbKeyPrefix + `pro-clients:${id}`
    return await rc.sMembers(clientsKey)
}

export async function addProfileClient(id: string, clientId: string) {
    const rc = await getDbClient()
    const clientsKey = dbKeyPrefix + `pro-clients:${id}`
    await rc.sAdd(clientsKey, clientId)
}

export async function removeProfileClient(id: string, clientId: string) {
    const rc = await getDbClient()
    const clientsKey = dbKeyPrefix + `pro-clients:${id}`
    await rc.sRem(clientsKey, clientId)
}

export interface ConversationInfo {
    id: string
    name: string
    ownerId: string // last known user profile ID of owner
}

export async function getConversationInfo(id: string) {
    const rc = await getDbClient()
    const conversationKey = dbKeyPrefix + `con:${id}`
    const existing = await rc.hGetAll(conversationKey)
    if (!existing?.id) {
        return undefined
    }
    return existing as unknown as ConversationInfo
}

export async function setConversationInfo(info: ConversationInfo) {
    const rc = await getDbClient()
    const conversationKey = dbKeyPrefix + `con:${info.id}`
    await rc.hSet(conversationKey, { ...info })
}

export async function updateLaunchData(clientId: string, profileId: string, username: string) {
    const clientData = await getClientData(clientId)
    if (!clientData?.profileId) {
        await addProfileClient(profileId, clientId)
    } else if (clientData?.profileId && clientData.profileId != profileId) {
        await removeProfileClient(clientData.profileId, clientId)
        await addProfileClient(profileId, clientId)
    }
    const existing = await getProfileData(profileId)
    // don't update the username on a shared profile (see #25)
    if (!existing || !existing?.password) {
        const update: ProfileData = { id: profileId, name: username }
        await saveProfileData(update)
    }
}
