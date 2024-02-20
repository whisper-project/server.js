// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {dbKeyPrefix, getDb} from './db.js'

export interface ProfileData {
    id: string
    name?: string
    password?: string
    whisperTimestamp?: string
    whisperProfile?: string
    listenTimestamp?: string
    listenProfile?: string
}

export async function getProfileData(id: string) {
    const rc = await getDb()
    const profileKey = dbKeyPrefix + `pro:${id}`
    const dbData: {[index:string]: string} = await rc.hGetAll(profileKey)
    if (!dbData?.id) {
        return undefined
    }
    return { ...dbData } as unknown as ProfileData
}

export async function saveProfileData(profileData: ProfileData) {
    const rc = await getDb()
    const profileKey = dbKeyPrefix + `pro:${profileData.id}`
    await rc.hSet(profileKey, { ...profileData })
}

export interface ConversationInfo {
    id: string,
    name: string,
    ownerId: string,    // last known user profile ID of owner
    ownerName: string,   // last known user profile name of owner
}

export async function getConversationInfo(id: string) {
    const rc = await getDb()
    const conversationKey = dbKeyPrefix + `con:${id}`
    const existing = await rc.hGetAll(conversationKey)
    if (!existing?.id) {
        return undefined
    }
    return existing as unknown as ConversationInfo
}

export async function setConversationInfo(info: ConversationInfo) {
    const rc = await getDb()
    const conversationKey = dbKeyPrefix + `con:${info.id}`
    await rc.hSet(conversationKey, { ...info })
}
