// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import { sendSecretToClient } from './apns.js'
import { ClientData, hasClientChanged, isApnsPostRepeat, setClientData } from './client.js'
import { getPresenceLogging } from './db.js'
import { updateLaunchData } from './profile.js'
import { parsePresenceChunk } from './protocol.js'
import { ChannelEvent } from './channelEvent.js'

export async function apnsToken(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.token || !body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' })
        return
    }
    const { token, clientId, lastSecret } = body
    const tokenHex = Buffer.from(token, 'base64').toString('hex')
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    const appInfo = body?.appInfo ? ` (${body.appInfo})` : ''
    const received: ClientData = {
        id: clientId,
        token: tokenHex,
        lastSecret: secretHex,
        userName: body?.userName || '',
        profileId: body?.profileId || '',
        appInfo: body?.appInfo || '',
        lastLaunch: Date.now(),
        isPresenceLogging: body?.isPresenceLogging ? 1 : 0,
    }
    // we need to ignore duplicate, almost-simultaneous posts from the same client
    // see issue #2 for details of the problem
    if (await isApnsPostRepeat(received)) {
        console.warn(`Ignoring duplicate APNs post from ${clientId}${appInfo}`)
        res.status(204).send()
        return
    }
    if (received.userName && received.profileId) {
        console.log(`Received profile ${received.profileId} (${received.userName}) at launch from client ${clientId}`)
        await updateLaunchData(received.id, received.profileId, received.userName)
    }
    const { clientChanged, changeReason } = await hasClientChanged(clientId, received)
    await setClientData(received)
    if (clientChanged) {
        console.log(`Received ${changeReason} client ${clientId}${appInfo}`)
        res.status(201).send()
    } else {
        console.log(`Received APNS token from unchanged client ${clientId}${appInfo}`)
        res.status(204).send()
    }
    await sendSecretToClient(clientId, clientChanged)
}

export async function apnsReceivedNotification(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in received notification post: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' })
        return
    }
    const { clientId, lastSecret } = body
    console.log(`Received confirmation of received notification from client ${clientId}`)
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    // see refreshSecret for details of this logic
    const received: ClientData = { id: clientId, secretDate: Date.now(), lastSecret: secretHex }
    await setClientData(received)
    res.status(204).send()
}

export async function logPresenceChunk(req: express.Request, res: express.Response) {
    const doLogging = await getPresenceLogging()
    if (!doLogging) {
        res.status(201).send()
        return
    }
    const { clientId, kind, sentOrReceived, chunk } = req.body
    const clientInfo = parsePresenceChunk(chunk)
    if (clientInfo) {
        console.log(`Client ${clientId} ${sentOrReceived} ${kind} chunk: ${JSON.stringify(clientInfo)}`)
    } else {
        console.error(`Received unknown log chunk: ${JSON.stringify(req.body)}`)
    }
    res.status(204).send()
}

export async function logAnomaly(req: express.Request, res: express.Response) {
    const { clientId, kind, message } = req.body
    console.log(`Client ${clientId} reports ${kind} anomaly: ${message}`)
    res.status(204).send()
}

export async function logChannelEvent(req: express.Request, res: express.Response) {
    const info = req.body as unknown as ChannelEvent
    console.log(JSON.stringify(info))
    res.status(204).send()
}