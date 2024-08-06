// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import { randomUUID } from 'crypto'

import { createAblyPublishTokenRequest, createAblySubscribeTokenRequest } from './auth.js'
import { subscribeResponse } from './templates.js'
import { validateClientAuth } from '../auth.js'
import {
    ConversationInfo,
    getConversationInfo,
    getProfileData,
    ProfileData,
    saveProfileData,
    setConversationInfo,
} from '../profile.js'
import { dbKeyPrefix, getDbClient, getPresenceLogging } from '../db.js'
import { ensureTranscriptionEnded, startTranscription } from './transcribe.js'

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const rc = await getDbClient()
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.activity || !body?.conversationId || !body.profileId) {
        console.log(
            `Missing key in pub-sub token request body from ${body?.clientId}: ${JSON.stringify(body)}`,
        )
        res.status(400).send({ status: 'error', reason: 'Invalid pub-sub POST data' })
        return
    }
    const { clientId, activity, conversationId } = body
    if (!(await validateClientAuth(req, res, clientId))) {
        console.error(`Unauthorized token v2 request received from application client ${clientId}`)
        return
    }
    if (activity.toLowerCase() == 'publish') {
        if (!body?.conversationName || !body?.contentId || !body?.username) {
            console.log(
                `Missing key in publish token v2 request body from client ${clientId}: ${JSON.stringify(body)}`,
            )
            res.status(400).send({ status: 'error', reason: 'Invalid publish POST data' })
            return
        }
        const cccKey = dbKeyPrefix + `ccc:${clientId}|${conversationId}|${body.contentId}`
        const existing = await rc.set(cccKey, 'whisper', { EX: 48 * 3600, GET: true })
        if (existing === null) {
            // this is the first time we've been asked to authenticate this conversation.
            // the expiration causes the key to be garbage collected
            // once the conversation is over (not being authenticated)
            console.log(
                `Whisperer ${body.profileId} (${body.username}) ` +
                    `is starting conversation ${conversationId} (${body.conversationName}) ` +
                    `from client ${clientId}`,
            )
            const info: ConversationInfo = {
                id: conversationId,
                name: body.conversationName,
                ownerId: body.profileId,
            }
            await setConversationInfo(info)
            const update: ProfileData = { id: body.profileId, name: body.username }
            await saveProfileData(update)
            // make sure any existing transcript for this profile or client is terminated,
            // in case the user crashed their app without stopping the transcript.
            const cptKey = dbKeyPrefix + `cpt:${body.profileId}`
            const existingProfileTranscriptId = await rc.get(cptKey)
            const cetKey = dbKeyPrefix + `cet:${clientId}`
            if (existingProfileTranscriptId !== null) {
                await ensureTranscriptionEnded(existingProfileTranscriptId)
            }
            const existingClientTranscriptId = await rc.get(cetKey)
            if (
                existingClientTranscriptId !== null &&
                existingClientTranscriptId !== existingProfileTranscriptId
            ) {
                await ensureTranscriptionEnded(existingClientTranscriptId)
            }
            if (body?.transcribe === 'yes') {
                const trId = await startTranscription(clientId, conversationId, body.contentId)
                // remember transcript against this profile and client
                await rc.set(cptKey, trId)
                await rc.set(cetKey, trId)
            } else {
                // there is no transcription against this profile or client
                await rc.del(cptKey)
                await rc.del(cetKey)
            }
        } else {
            console.log(
                `Renewing authentication: Whisperer ${body.profileId} (${body.username}) ` +
                    `for conversation ${conversationId} (${body.conversationName}) ` +
                    `from client ${clientId}`,
            )
        }
        const tokenRequest = await createAblyPublishTokenRequest(
            clientId,
            conversationId,
            body.contentId,
        )
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else if (activity.toLowerCase() == 'subscribe') {
        const ccKey = dbKeyPrefix + `ccc:${clientId}|${conversationId}`
        const existing = await rc.set(ccKey, 'listen', { EX: 3660, GET: true })
        if (existing !== null) {
            const profile = await getProfileData(body.profileId)
            console.log(
                `Listener ${body.profileId} (${profile?.name}) ` +
                    `is looking for conversation ${conversationId} (${body.conversationName}) ` +
                    `from client ${clientId}`,
            )
        } else {
            const profile = await getProfileData(body.profileId)
            console.log(
                `Renewing authentication: Listener ${body.profileId} (${profile?.name}) ` +
                    `to listen to conversation ${conversationId} (${body.conversationName}) ` +
                    `from client ${clientId}`,
            )
        }
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else {
        console.error(
            `Invalid activity in token v2 request from client {$clientId}: ${JSON.stringify(body)}`,
        )
        res.status(400).send({ status: 'error', reason: 'Invalid activity' })
    }
}

export async function listenToConversation(req: express.Request, res: express.Response) {
    function setCookie(name: string, value: string) {
        res.cookie(name, value, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
    }

    const conversationId = req.params?.conversationId
    let haveConversationData = true
    if (!conversationId || !conversationId.match(/^[-0-9a-zA-Z]{36}$/)) {
        console.error(`Web browser is looking for invalid conversation ${conversationId}`)
        haveConversationData = false
    }
    const info = await getConversationInfo(conversationId)
    const profileData = info ? await getProfileData(info.ownerId) : undefined
    if (!info) {
        console.error(`Web browser is looking for unknown conversation ${conversationId}`)
        haveConversationData = false
    } else if (!profileData?.name) {
        console.error(
            `Web browser is looking for conversation ${conversationId} with unknown profile owner ${info.ownerId}`,
        )
        haveConversationData = false
    }
    if (!haveConversationData) {
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    let clientId = req?.session?.clientId
    if (!clientId) {
        clientId = randomUUID().toUpperCase()
        console.log(`Created new client for web: ${clientId}`)
    }
    console.log(
        `Sending listen page for conversation ${conversationId} (${info!.name}) to web client ${clientId}`,
    )
    req.session = { clientId, conversationId }
    setCookie('conversationId', conversationId)
    setCookie('conversationName', info!.name)
    setCookie('whispererName', profileData!.name!)
    setCookie('clientId', clientId)
    setCookie('clientName', req.cookies?.clientName || '')
    setCookie('logPresenceChunks', (await getPresenceLogging()) ? 'yes' : '')
    const body = subscribeResponse(info!.name, profileData!.name!)
    res.status(200).send(body)
}

export async function listenTokenRequest(req: express.Request, res: express.Response) {
    const clientId = req?.session?.clientId
    const clientName = req?.cookies?.clientName || 'unknown'
    const conversationId = req?.session?.conversationId
    const conversationName = req?.cookies?.conversationName || 'unknown'
    if (!clientId || !conversationId) {
        console.error('Refusing listen token request outside of session')
        res.status(403).send({ status: 'error', reason: 'no session to support authentication' })
        return
    }
    console.log(
        `Listen token request from web client ${clientId} (${clientName}) ` +
            `to conversation ${conversationId} (${conversationName})`,
    )
    const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
    res.status(200).send(tokenRequest)
}

export async function postUsername(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.name) {
        console.log(`Missing key in username POST body from ${clientId}: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid username POST data' })
        return
    }
    const update: ProfileData = { id: body.id, name: body.name }
    await saveProfileData(update)
    console.info(`Posted username for profile ${body.id} (${body.name}) from client ${clientId}`)
    res.status(204).send()
}

export async function postConversation(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.name || !body?.ownerId || typeof body?.ownerName !== 'string') {
        console.log(
            `Missing key in conversation POST body from ${clientId}: ${JSON.stringify(body)}`,
        )
        res.status(400).send({ status: 'error', reason: 'Invalid conversation POST data' })
        return
    }
    const info: ConversationInfo = { id: body.id, name: body.name, ownerId: body.ownerId }
    const existing = await getConversationInfo(info.id)
    if (existing && existing.ownerId != info.ownerId) {
        console.error(
            `Collision on owner profile ${info.id}: POST from client ${clientId} is rejected`,
        )
        res.status(409).send({ status: 'error', reason: `Owner ID doesn't match existing` })
        return
    }
    await setConversationInfo(info)
    const update: ProfileData = { id: body.ownerId, name: body.ownerName }
    await saveProfileData(update)
    if (existing) {
        console.info(
            `Updated conversation ${info.id} (${info.name}) ` +
                `for user ${info.ownerId} (${body.ownerName}) posted from client ${clientId}`,
        )
        res.status(204).send()
    } else {
        console.log(
            `New conversation ${info.id} (${info.name}) ` +
                `for user ${info.ownerId} (${body.ownerName}) posted from client ${clientId}`,
        )
        res.status(201).send()
    }
}
