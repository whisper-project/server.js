// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

/*
Database design note:

A transcription of a conversation is a hash with these fields:

- conversationId - the conversation ID
- startTime - the start date of the conversation (epoch milliseconds)
- duration - the length of the conversation (milliseconds)
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

export interface TranscriptData {
    id: string,
    conversationId: string,
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

export async function postTranscript(req: express.Request, resp: express.Response) {
    const text = req.body.text
    if (!text) {
        resp.status(400).send('No "text" field in posted JSON data')
    }
    const tr: TranscriptData = {
        id: randomUUID(),
        conversationId: randomUUID().toUpperCase(),
        startTime: Date.now(),
        duration: 320000,
        contentKey: randomUUID(),
        transcription: text,
        errCount: 0,
    }
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

export async function startTranscription(clientId: string, conversationId: string, contentId: string) {
    const transcript = await createTranscript(conversationId)
    const { id, contentKey } = transcript
    console.log(`Transcribing conversation ${conversationId}, client ${clientId}, channel ${contentId}: transcript ${id}, chunks: ${contentKey}`)
    const config = getSettings()
    const ably = new Ably.Realtime({
        clientId: 'whisper-server:' + contentId,
        key: config.ablyPublishKey,
    })
    const content = ably.channels.get(`${conversationId}:${contentId}`)
    const rc = await getDb()
    content.subscribe('all', (message) => {
        rc.lPush(contentKey, message.data).then()
    }).then(_ => console.log(`Subscribed to ${conversationId}:${contentId}`))
    const control = ably.channels.get(`${conversationId}:control`)
    control.presence.subscribe((message) => {
        if (message.clientId == clientId) {
            switch (message.action) {
                case 'enter':
                case 'present':
                    console.log(`Conversation ${conversationId} (transcript ${id}, chunks ${contentKey}) is starting.`)
                    break
                case 'leave':
                case 'absent':
                    content.detach().then()
                    control.presence.leave('transcription')
                    control.presence.unsubscribe()
                    control.detach().then()
                    setTimeout(() => ably.close(), 2000)
                    console.log(`Conversation ${conversationId} (transcript ${id}, chunks ${contentKey}) has ended.`)
                    endTranscription(transcript).then()
                    break
                case 'update':
                    break
                default:
                    console.error(`Unexpected presence message in transcription: ${message.action}`)
            }
        }
    }).then(_ => console.log(`Subscribed to ${conversationId}:control`))
    control.presence.enter('transcription').then()
}

async function endTranscription(data: TranscriptData) {
    data.duration = Date.now() - data.startTime
    const { text, errCount } = await transcribePackets(data.id, data.contentKey)
    data.transcription = text
    data.errCount = errCount
    await saveTranscript(data)
    if (text || errCount) {
        console.log(`Adding transcript of length ${text.length} to conversation ${data.conversationId}`)
        await addTranscriptToConversation(data)
    } else {
        console.warn(`Discarding empty transcript for conversation ${data.conversationId}`)
        await deleteTranscript(data)
    }
}

async function createTranscript(conversationId: string, ttl: number | undefined = undefined) {
    const id: string = randomUUID()
    const contentKey = dbKeyPrefix + 'tcp:' + randomUUID()
    const data: TranscriptData = {
        id,
        conversationId,
        startTime: Date.now(),
        contentKey: contentKey,
    }
    if (typeof ttl === 'number' && ttl > 0) {
        data.ttl = ttl
    }
    await saveTranscript(data)
    return data
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

export async function saveTranscript(data: TranscriptData) {
    const rc = await getDb()
    const tKey = dbKeyPrefix + 'tra:' + data.id
    const ttl = data?.ttl || defaultTranscriptTtl
    const newData: { [k: string]: string } = {
        id: data.id,
        conversationId: data.conversationId,
        startTime: data.startTime.toString(),
        contentKey: data.contentKey,
    }
    if (data?.ttl) {
        newData.ttl = ttl.toString()
    }
    if (typeof data?.duration === 'number') {
        newData.duration = data.duration.toString()
    }
    if (data?.transcription) {
        newData.transcription = data.transcription
    }
    await rc.hSet(tKey, newData)
    await rc.expire(data.contentKey, ttl)
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
