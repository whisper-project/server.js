// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { dbKeyPrefix, getDb, setPresenceLogging } from '../db.js'
import { getProfileClients, removeProfileClient } from '../profile.js'
import { ClientData, getClientData } from '../client.js'
import { loadSettings } from '../settings.js'
import { getTranscriptsForConversation, saveTranscript } from './transcribe.js'

const oneDayMillis = 24 * 60 * 60 * 1000
const oneDaySeconds = 24 * 60 * 60
const oneDayAgo = Date.now() - oneDayMillis
const thirtyDaysAgo = Date.now() - (30 * oneDayMillis)
const sevenDaysAgo = Date.now() - (7 * oneDayMillis)

async function getProfilesAndClients() {
    const rc = await getDb()
    const keys = await rc.keys(dbKeyPrefix + 'pro:*')
    const profileClients: { [k: string]: string[] } = {}
    for (const key of keys) {
        const id = key.substring((dbKeyPrefix + 'pro:').length)
        profileClients[id] = await getProfileClients(id)
    }
    return profileClients
}

async function getAllClients() {
    const rc = await getDb()
    const keys = await rc.keys(dbKeyPrefix + 'cli:*')
    const clients: { [k: string]: ClientData } = {}
    for (const key of keys) {
        const id = key.substring((dbKeyPrefix + 'cli:').length)
        const data = await getClientData(id)
        if (data) {
            clients[id] = data
        }
    }
    return clients
}

async function countUnusedProfiles(andDeleteThem: boolean = false) {
    const pc = await getProfilesAndClients()
    const profileKeys: string[] = []
    const clientKeys: string[] = []
    for (const id in pc) {
        if (pc[id].length == 0) {
            profileKeys.push(dbKeyPrefix + 'pro:' + id)
            clientKeys.push(dbKeyPrefix + 'pro-clients:' + id)
        }
    }
    console.log(`There are ${profileKeys.length} profiles with no associated clients.`)
    console.log(`They are:\n${JSON.stringify(profileKeys, null, 2)}`)
    if (andDeleteThem) {
        const rc = await getDb()
        const deletedKeyCount = await rc.del(profileKeys)
        console.warn(`Deleted ${deletedKeyCount} profiles`)
        const deletedClientCount = await rc.del(clientKeys)
        console.warn(`Deleted ${deletedClientCount} empty client sets`)
    }
}

async function countUnusedClients(unusedSince: number = thirtyDaysAgo, andDeleteThem: boolean = false) {
    const clients = await getAllClients()
    const oldClientIds: string[] = []
    const oldClientKeys: string[] = []
    for (const id in clients) {
        if (!clients[id]?.lastLaunch || clients[id].lastLaunch! < unusedSince) {
            oldClientIds.push(id)
            oldClientKeys.push(dbKeyPrefix + 'cli:' + id)
        }
    }
    console.log(`There are ${oldClientIds.length} clients unused since ${new Date(unusedSince)}`)
    console.log(`They are:\n${JSON.stringify(oldClientKeys, null, 2)}`)
    if (andDeleteThem) {
        const rc = await getDb()
        for (const id of oldClientIds) {
            const profileId = clients[id].profileId
            if (profileId) {
                await removeProfileClient(profileId, id)
            }
        }
        const deleted = await rc.del(oldClientKeys)
        console.log(`Deleted ${deleted} clients unused since ${new Date(unusedSince)}`)
    }
}

async function showTranscripts(collectedBefore: number = Date.now()) {
    const rc = await getDb()
    const prefix = dbKeyPrefix + `con:`
    const keys = await rc.keys(`${prefix}*`)
    for (const key of keys) {
        const id = key.substring(prefix.length)
        const transcripts = await getTranscriptsForConversation(id)
        let showHeading = true
        for (const tr of transcripts) {
            if (tr.startTime > collectedBefore) {
                break
            }
            if (showHeading) {
                console.log(`Transcripts for conversation: ${id}:`)
                console.log(`------------------------------------`)
                showHeading = false
            }
            console.log(`Start: ${new Date(tr.startTime)}, Duration: ${tr.duration! / 1000}:\n${tr.transcription}`)
            console.log(`------------------------------------`)
        }
    }
}

async function ensureTranscriptExpiration(seconds: number = 7 * oneDaySeconds) {
    const rc = await getDb()
    const prefix = dbKeyPrefix + `con:`
    const keys = await rc.keys(`${prefix}*`)
    for (const key of keys) {
        const id = key.substring(prefix.length)
        const transcripts = await getTranscriptsForConversation(id)
        for (const tr of transcripts) {
            if (tr['contentPacketKey']) {
                if (!tr['contentKey']) {
                    tr.contentKey = tr['contentPacketKey']
                }
                delete tr['contentPacketKey']
            }
            if (typeof tr?.ttl === 'number') {
                console.log(`Transcript ${tr.id} of conversation ${tr.conversationId} already has TTL of ${seconds}sec`)
            } else {
                tr.ttl = seconds
                await saveTranscript(tr)
                console.log(`Transcript ${tr.id} of conversation ${tr.conversationId} now has TTL of ${seconds}sec`)
            }
        }
    }
}

async function doMaintenance(chores: string[]) {
    loadSettings()
    for (const chore of chores) {
        if (chore.startsWith('logging-')) {
            if (chore.endsWith('on')) {
                await setPresenceLogging(true)
            } else if (chore.endsWith('off')) {
                await setPresenceLogging(false)
            } else {
                throw Error(`Unrecognized chore: ${chore}`)
            }
        } else if (chore == 'count-unused') {
            await countUnusedClients()
            await countUnusedProfiles()
        } else if (chore == 'delete-unused') {
            await countUnusedClients(thirtyDaysAgo, true)
            await countUnusedProfiles(true)
        } else if (chore.startsWith('show-transcripts-')) {
            if (chore.endsWith('all')) {
                await showTranscripts()
            } else if (chore.endsWith('1')) {
                await showTranscripts(oneDayAgo)
            } else if (chore.endsWith('7')) {
                await showTranscripts(sevenDaysAgo)
            } else if (chore.endsWith('30')) {
                await showTranscripts(thirtyDaysAgo)
            } else {
                throw Error(`Unrecognized chore: ${chore}`)
            }
        } else if (chore === 'ensure-transcript-expiration') {
            await ensureTranscriptExpiration()
        } else {
            throw Error(`Unrecognized chore: ${chore}`)
        }
    }
}

doMaintenance(process.argv.slice(2)).then(() => {
    console.log(`Maintenance complete`)
    process.exit(0)
})
