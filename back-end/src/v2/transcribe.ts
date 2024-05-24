// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

/*
Database design note:

A transcription of a conversation session is a hash with these fields:

- clientId - the Whisperer's client ID for this session
- conversationId - the conversation ID
- contentId - the content channel id for this session
- startTime - the start date of this session (epoch milliseconds)
- duration - the length of the session (milliseconds)
- contentKey - a key to a list containing the content chunks in reverse-chronological order
- transcription - a string containing the transcription of the chunks
- errCount - a count of transcription errors due to missing or corrupt chunks
- ttl - the time to live for the transcript (seconds, defaults to 1 week)

The transcription and errCount fields are not filled until the conversation is over
and the packets are transcribed.  At that point, if there are no errors, the saved
content chunks are deleted.

The keys for the non-empty transcripts of a given conversation are kept in a list
keyed by the conversation ID.  There is no guarantee about their order in that list,
but the public function that returns them sorts them newest start-date first.

Transcript lifetime design note:

Transcripts are started by server processes, but server processes are ephemeral,
and the lifetime of a conversation may be longer than any given server process.
In order for a transcript to outlive the server that starts them, that server
hands the transcript session off when it shuts down by adding the transcript
to a known queue. Every running server checks that queue on a continuous basis,
so as long as any server is running the transcript will be picked up by some
server as soon as it's queued.

Transcripts are only kept for a limited period, called their time-to-live.
Database expirations are used to enforce the TTL, which saves the server
from having to periodically delete old transcripts.

 */

import * as Ably from 'ably/promises.js'
import { getSettings } from '../settings.js'
import { dbKeyPrefix, getDb } from '../db.js'
import { randomUUID } from 'crypto'
import { parseContentChunk } from '../protocol.js'
import express from 'express'
import { transcriptResponse } from './templates.js'
import { getConversationInfo } from '../profile.js'
import { validateClientAuth } from '../auth.js'
import { getClientData } from '../client.js'

const defaultTranscriptTtl = 24 * 60 * 60
const globalTranscriptQueueKey = 'trq:global'
const localTranscriptQueue: (() => Promise<void>)[] = []

export interface TranscriptData {
    id: string,
    clientId: string,
    conversationId: string,
    contentId: string,
    startTime: number,
    duration?: number,
    contentKey: string,
    transcription?: string,
    errCount?: number,
    ttl?: number,
}

export async function getTranscriptsForConversation(conversationId: string) {
    const rc = await getDb()
    const key = dbKeyPrefix + 'cts:' + conversationId
    const ids = await rc.lRange(key, 0, -1)
    const liveKeys: string[] = []
    const transcripts: TranscriptData[] = []
    for (const id of ids) {
        const tr = await getTranscript(id)
        if (tr) {
            transcripts.push(tr)
            liveKeys.push(id)
        }
    }
    if (liveKeys.length == 0) {
        await rc.del(key)
    } else {
        await rc.multi()
            .del(key)
            .rPush(key, liveKeys)
            .exec()
    }
    return transcripts.sort((a, b) => b.startTime - a.startTime)
}

export async function getTranscriptPage(req: express.Request, resp: express.Response) {
    const tr = await getTranscript(req.params.transcriptId)
    if (!tr) {
        console.error(`Request for unknown transcript ${req.params.transcriptId}`)
        resp.sendStatus(404)
        return
    }
    if (req.params.conversationId !== tr.conversationId) {
        console.error(`Request for transcript against non-matching conversation id`)
        resp.sendStatus(404)
        return
    }
    console.log(`Sending transcript ${tr.id} for conversation ${tr.conversationId}`)
    const page = await transcriptResponse(tr)
    resp.status(200).send(page)
}

export async function listTranscripts(req: express.Request, resp: express.Response) {
    const { clientId, conversationId } = req.params
    const con = await getConversationInfo(conversationId)
    if (!con) {
        console.error(`Request for transcripts for unknown conversation`)
        resp.status(404).send({ status: 'error', reason: 'Not Found' })
        return
    }
    const cli = await getClientData(clientId)
    if (!clientId || cli?.profileId !== con.ownerId) {
        console.error(`Request for transcripts for non-matching client and conversation`)
        resp.status(404).send({ status: 'error', reason: 'Not Found' })
    }
    if (!await validateClientAuth(req, resp, clientId)) {
        return
    }
    const trs = await getTranscriptsForConversation(req.params.conversationId)
    console.log(`Returning info on ${trs.length} transcripts`)
    const data = trs.map(tr => {
        return { id: tr.id, startTime: tr.startTime, duration: tr.duration, length: tr.transcription!.length }
    })
    resp.status(200).send(data)
}

export async function suspendTranscriptions() {
    let count = 0
    for (let fn = localTranscriptQueue.pop(); fn; fn = localTranscriptQueue.pop()) {
        await fn()
        count++
    }
    return count
}

export async function resumeTranscriptions() {
    const rc = await getDb()
    const key = dbKeyPrefix + globalTranscriptQueueKey
    let count = 0
    for (let id = await rc.rPop(key); id !== null; id = await rc.rPop(key)) {
        const tr = await getTranscript(id)
        if (!tr) {
            console.warn(`Global transcript ${id} no longer exists, can't resume it`)
            continue
        }
        console.log(`Resume transcription ${tr.id} for conversation ${tr.conversationId}`)
        await startLocalTranscript(tr)
        count++
    }
    return count
}

export async function startTranscription(clientId: string, conversationId: string, contentId: string) {
    const tr = await createTranscript(clientId, conversationId, contentId)
    console.log(`Start transcription for conversation ${conversationId} in transcription ${tr.id}`)
    await startLocalTranscript(tr)
}

async function startLocalTranscript(tr: TranscriptData) {
    console.log(`Locally listening for transcript ${tr.id}, clientId: ${tr.clientId}, contentId: ${tr.contentId}, chunks: ${tr.contentKey}`)
    const config = getSettings()
    const ably = new Ably.Realtime({
        clientId: 'whisper-server:' + tr.id,
        key: config.ablyPublishKey,
    })
    await subscribeTranscriptContent(tr, ably)
    await subscribeTranscriptPresence(tr, ably)
    localTranscriptQueue.push(() => suspendTranscription(tr, ably))
}

async function subscribeTranscriptContent(tr: TranscriptData, ably: Ably.Realtime) {
    const rc = await getDb()
    const content = ably.channels.get(`${tr.conversationId}:${tr.contentId}`)
    await content.subscribe('all', (message) => {
        rc.lPush(tr.contentKey, message.data).then()
    })
    console.log(`Subscribed to ${tr.conversationId}:${tr.contentId}`)
}

async function subscribeTranscriptPresence(tr: TranscriptData, ably: Ably.Realtime) {
    const content = ably.channels.get(`${tr.conversationId}:${tr.contentId}`)
    const control = ably.channels.get(`${tr.conversationId}:control`)
    await control.presence.subscribe((message) => {
        if (message.clientId == tr.clientId) {
            switch (message.action) {
                case 'enter':
                case 'present':
                    console.log(`Conversation ${tr.conversationId} (transcript ${tr.id}, chunks ${tr.contentKey}) is starting.`)
                    break
                case 'leave':
                case 'absent':
                    content.detach().then()
                    control.presence.leave('transcription')
                    control.presence.unsubscribe()
                    control.detach().then()
                    setTimeout(() => ably.close(), 2000)
                    console.log(`Transcription ${tr.id} (conversation ${tr.conversationId}, chunks ${tr.contentKey}) has ended.`)
                    endTranscription(tr).then()
                    break
                case 'update':
                    break
                default:
                    console.error(`Ignoring unexpected presence message in transcription: ${message.action}`)
            }
        }
    })
    console.log(`Subscribed to presence on ${tr.conversationId}:control`)
    await control.presence.enter('transcription')
}

async function suspendTranscription(tr: TranscriptData, ably: Ably.Realtime) {
    console.log(`Suspending transcription ${tr.id} for conversation ${tr.conversationId}`)
    const content = ably.channels.get(`${tr.conversationId}:${tr.contentId}`)
    const control = ably.channels.get(`${tr.conversationId}:control`)
    await content.detach()
    await control.presence.leave('transcription')
    control.presence.unsubscribe()
    await control.detach()
    ably.close()
    const rc = await getDb()
    const key = dbKeyPrefix + globalTranscriptQueueKey
    await rc.lPush(key, tr.id)
}

async function endTranscription(tr: TranscriptData) {
    tr.duration = Date.now() - tr.startTime
    const { text, errCount } = await transcribePackets(tr.id, tr.contentKey)
    tr.transcription = text
    tr.errCount = errCount
    await saveTranscript(tr)
    if (text || errCount) {
        console.log(`Adding transcript of length ${text.length} to conversation ${tr.conversationId}`)
        await addTranscriptToConversation(tr)
    } else {
        console.warn(`Discarding empty transcript for conversation ${tr.conversationId}`)
        await deleteTranscript(tr)
    }
}

async function createTranscript(clientId: string, conversationId: string, contentId: string, ttl: number | undefined = undefined) {
    const id: string = randomUUID()
    const contentKey = dbKeyPrefix + 'tcp:' + randomUUID()
    const tr: TranscriptData = {
        id,
        clientId,
        conversationId,
        contentId,
        startTime: Date.now(),
        contentKey: contentKey,
    }
    if (typeof ttl === 'number' && ttl > 0) {
        tr.ttl = ttl
    }
    await saveTranscript(tr)
    return tr
}

async function getTranscript(transcriptId: string) {
    const rc = await getDb()
    const tKey = dbKeyPrefix + 'tra:' + transcriptId
    const data: { [k: string]: string | number } = await rc.hGetAll(tKey)
    if (!data?.id) {
        return undefined
    }
    if (typeof data?.startTime === 'string') {
        data.startTime = parseInt(data.startTime)
    }
    if (typeof data?.duration === 'string') {
        data.duration = parseInt(data.duration)
    }
    return data as unknown as TranscriptData
}

export async function saveTranscript(tr: TranscriptData) {
    const rc = await getDb()
    const tKey = dbKeyPrefix + 'tra:' + tr.id
    const ttl = tr?.ttl || defaultTranscriptTtl
    const newData: { [k: string]: string } = {
        id: tr.id,
        clientId: tr.clientId,
        conversationId: tr.conversationId,
        contentId: tr.contentId,
        startTime: tr.startTime.toString(),
        contentKey: tr.contentKey,
    }
    if (tr?.ttl) {
        newData.ttl = ttl.toString()
    }
    if (typeof tr?.duration === 'number') {
        newData.duration = tr.duration.toString()
    }
    if (tr?.transcription) {
        newData.transcription = tr.transcription
    }
    await rc.hSet(tKey, newData)
    await rc.expire(tr.contentKey, ttl)
    await rc.expire(tKey, ttl)
}

async function deleteTranscript(tr: TranscriptData) {
    const rc = await getDb()
    const cKey = tr.contentKey
    const tKey = dbKeyPrefix + 'tra:' + tr.id
    await rc.del([tKey, cKey])
}

async function addTranscriptToConversation(data: TranscriptData) {
    const rc = await getDb()
    const cKey = dbKeyPrefix + 'cts:' + data.conversationId
    await rc.lPush(cKey, data.id)
}

async function transcribePackets(transcriptId: string, contentKey: string) {
    const rc = await getDb()
    let liveText = ''
    let transcription = ''
    let errCount = 0
    const chunks = await rc.lRange(contentKey, 0, -1)
    if (chunks.length == 0) {
        console.warn(`No packets in transcript ${transcriptId} to transcribe`)
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
        const chunk = parseContentChunk(chunks[i])
        if (!chunk) {
            console.warn(`Transcription: Skipping illegal content chunk: ${chunks[i]}`)
            errCount++
            continue
        }
        if (chunk.offset === 'playSound') {
            // don't put sounds in the transcription
        } else if (chunk.offset === 'newline') {
            if (transcription) {
                transcription = transcription + '\n' + liveText
            } else {
                transcription = liveText
            }
            liveText = ''
        } else if (chunk.offset === 0) {
            liveText = chunk.text
        } else if (chunk.isDiff) {
            const offset = chunk.offset as number
            if (offset == liveText.length) {
                liveText = liveText + chunk.text
            } else if (offset < liveText.length) {
                liveText = liveText.substring(0, offset) + chunk.text
            } else {
                const diff = offset - liveText.length
                console.warn(`Transcription: Chunk offset indicates ${diff} missing characters, using ?`)
                errCount++
                liveText = liveText + '?'.repeat(diff) + chunk.text
            }
        } else {
            console.warn(`Transcription: Skipping unexpected content chunk: ${chunks[i]}`)
            errCount++
        }
    }
    if (liveText) {
        transcription = transcription + '\n' + liveText
    }
    if (errCount == 0) {
        await rc?.del(contentKey)
    } else {
        console.warn(`Transcription errors in content ${contentKey}, not removing packets.`)
    }
    return { text: transcription, errCount }
}

// testing - not exposed in production
export async function postTranscript(req: express.Request, resp: express.Response) {
    const text = req.body.text
    if (!text) {
        resp.status(400).send('No "text" field in posted JSON data')
    }
    const tr: TranscriptData = {
        id: randomUUID(),
        clientId: randomUUID().toUpperCase(),
        conversationId: randomUUID().toUpperCase(),
        contentId: randomUUID().toUpperCase(),
        startTime: Date.now(),
        duration: 320000,
        contentKey: randomUUID(),
        transcription: text,
        errCount: 0,
    }
    const page = await transcriptResponse(tr)
    resp.status(200).send(page)
}
