// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import { sendSecretToClient } from './apns.js'
import { ClientData, hasClientChanged, setClientData } from './client.js'
import { incrementErrorCounts } from './db.js'
import { updateLaunchData } from './profile.js'
import { parseControlChunk } from './protocol.js'

const recentlyReceived: ClientData[] = []

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
        tokenDate: Date.now(),
        lastSecret: secretHex,
        userName: body?.userName || '',
        profileId: body?.profileId || '',
        appInfo: body?.appInfo || '',
        lastLaunch: Date.now(),
    }
    // we need to ignore duplicate, almost-simultaneous posts from the same client
    // see issue #2 for details of the problem
    for (let i = 0; i < recentlyReceived.length;) {
        const recent = recentlyReceived[i]
        if (recent.tokenDate! + 250 < received.tokenDate!) {
            recentlyReceived.splice(i, 1)
        } else if (recent.id === received.id && recent.token === received.token) {
            console.warn(`Ignoring duplicate APNs post from ${clientId}${appInfo}`)
            res.setHeader('X-Received-Earlier', recent.tokenDate!.toString())
            res.status(204).send()
            return
        } else {
            i += 1
        }
    }
    recentlyReceived.push(received)
    if (received.userName && received.profileId) {
        console.log(`Received profile ${received.profileId} (${received.userName}) at launch from client ${clientId}`)
        await updateLaunchData(received.id, received.profileId, received.userName)
    }
    const { clientChanged, changeReason } = await hasClientChanged(clientId, received)
    await setClientData(received)
    await incrementErrorCounts(body)
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

export async function logControlChunk(req: express.Request, res: express.Response) {
    const { clientId, kind, sentOrReceived, chunk } = req.body
    const clientInfo = parseControlChunk(chunk)
    if (clientInfo) {
        console.log(`Client ${clientId} ${sentOrReceived} ${kind} chunk: ${JSON.stringify(clientInfo)}`)
    } else {
        console.error(`Received unknown log chunk: ${JSON.stringify(req.body)}`)
    }
    res.status(204).send()
}