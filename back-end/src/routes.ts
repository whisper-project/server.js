// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {sendSecretToClient} from './apns.js'
import {ClientData, hasClientChanged, setClientData} from './client.js'
import {incrementErrorCounts} from './db.js'

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
    const received: ClientData = {
        id: clientId,
        token: tokenHex,
        tokenDate: Date.now(),
        lastSecret: secretHex,
        userName: body?.userName || '',
        appInfo: body?.appInfo || '',
    }
    const {clientChanged, changeReason} = await hasClientChanged(clientKey, received)
    await incrementErrorCounts(body)
    const appInfo = body?.appInfo ? ` (${body.appInfo})` : ''
    if (clientChanged) {
        console.log(`Received ${changeReason} client ${clientKey}${appInfo}`)
        received.apnsLastSecret = received.lastSecret
        await setClientData(clientKey, received)
    } else {
        console.log(`Received APNS token from unchanged client ${clientKey}${appInfo}`)
    }
    res.setHeader("Content-Type", "text/plain")
    res.status(204).send(appInfo)
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