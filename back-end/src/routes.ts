// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {sendSecretToClient} from './apns.js'
import {ClientData, hasClientChanged, setClientData} from './client.js'
import {incrementErrorCounts} from './db.js'

const recentlyReceived: ClientData[] = []

export async function apnsToken(req: express.Request, res: express.Response)  {
    const body: { [p: string]: string } = req.body
    if (!body?.token || !body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const { token, clientId, lastSecret } = body
    const clientKey = `cli:${clientId}`
    const tokenHex = Buffer.from(token, 'base64').toString('hex')
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    const appInfo = body?.appInfo ? ` (${body.appInfo})` : ''
    const received: ClientData = {
        id: clientId,
        token: tokenHex,
        tokenDate: Date.now(),
        lastSecret: secretHex,
        userName: body?.userName || '',
        appInfo: body?.appInfo || '',
    }
    // we need to ignore duplicate, almost-simultaneous posts from the same client
    // see issue #2 for details of the problem
    for (let i = 0; i < recentlyReceived.length; ) {
        const recent = recentlyReceived[i]
        if (recent.tokenDate! + 250 < received.tokenDate!) {
            recentlyReceived.splice(i, 1)
        } else if (recent.id === received.id && recent.token === received.token) {
            console.warn(`Ignoring duplicate APNs post from ${clientKey}${appInfo}`)
            res.setHeader('X-Received-Earlier', recent.tokenDate!.toString())
            res.status(204).send()
            return
        } else {
            i += 1
        }
    }
    recentlyReceived.push(received)
    const {clientChanged, changeReason} = await hasClientChanged(clientKey, received)
    await incrementErrorCounts(body)
    if (clientChanged) {
        console.log(`Received ${changeReason} client ${clientKey}${appInfo}`)
        await setClientData(clientKey, received)
    } else {
        console.log(`Received APNS token from unchanged client ${clientKey}${appInfo}`)
    }
    res.status(204).send()
    await sendSecretToClient(clientKey, clientChanged)
}

export async function apnsReceivedNotification(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in received notification post: ${JSON.stringify(body)}`)
        res.status(400).send({status: 'error', reason: 'Invalid post data'});
        return
    }
    const {clientId, lastSecret} = body
    const clientKey = `cli:${clientId}`
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    // see refreshSecret for details of this logic
    const received: ClientData = {id: clientId, secretDate: Date.now(), lastSecret: secretHex}
    await setClientData(clientKey, received)
    console.log(`Received confirmation of received notification from client ${clientKey}`)
    res.status(204).send()
}