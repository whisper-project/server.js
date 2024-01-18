// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {dbKeyPrefix, getDb} from './db.js'

export interface ConversationInfo {
    id: string,
    name: string,
    ownerId: string,    // user profile ID of owner
    ownerName: string,   // user profile name of owner
}

export async function getConversationInfo(conversationKey: string) {
    const rc = await getDb()
    const existing = await rc.hGetAll(dbKeyPrefix + conversationKey)
    if (!existing?.id || !existing.name || !existing?.ownerId || !existing?.username) {
        return undefined
    }
    return existing as unknown as ConversationInfo
}

export async function setConversationInfo(conversationKey: string, info: ConversationInfo) {
    const rc = await getDb()
    await rc.hSet(dbKeyPrefix + conversationKey, { ...info })
}
