// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {ClientData, getClientData, setClientData} from './db.js'
import {sendSecretToClient} from './apns.js'
import {createAblyPublishTokenRequest, createAblySubscribeTokenRequest, validateClientJwt} from './auth.js'

export async function apnsToken(req: express.Request, res: express.Response)  {
    const body = req.body
    if (!body?.token || !body?.deviceId || !body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const clientKey = `cli:${body.clientId}`
    const tokenHex = Buffer.from(body.token, 'base64').toString('hex')
    const secretHex = Buffer.from(body.lastSecret, 'base64').toString('hex')
    const received: ClientData = {
        id: body.clientId,
        deviceId: body.deviceId,
        token: tokenHex,
        tokenDate: Date.now(),
        lastSecret: secretHex
    }
    const existing = await getClientData(clientKey)
    // see refreshSecret for explanation of logic around lastSecret
    let clientChanged = !existing || received.lastSecret !== existing?.lastSecret
    clientChanged = clientChanged || received.token !== existing?.token || received.deviceId !== existing?.deviceId
    if (clientChanged) {
        console.log(`Received APNS token from new or changed client ${clientKey}`)
        await setClientData(clientKey, received)
    } else {
        console.log(`Received APNS token from unchanged client ${clientKey}`)
    }
    res.status(204).send()
    await sendSecretToClient(clientKey, clientChanged)
}

export async function apnsReceivedNotification(req: express.Request, res: express.Response) {
    const body = req.body
    if (!body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in received notification post: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const clientKey = `cli:${body.clientId}`
    // see refreshSecret for details of this logic
    const received: ClientData = { id: body.clientId, secretDate: Date.now(), lastSecret: body.secret }
    await setClientData(clientKey, received)
    console.log(`Received confirmation of received notification from client ${clientKey}`)
    res.status(204).send()
}

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body = req.body
    if (!body?.clientId || !body?.activity || !body?.publisherId) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const clientKey = `cli:${body.clientId}`
    console.log(`Token request received from client ${clientKey}`)
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (!await validateClientJwt(auth.substring(7), clientKey)) {
        console.log(`Client JWT failed to validate`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization' })
        return
    }
    if (body.activity !== "publish" && body.activity !== "subscribe") {
        console.log(`Publishing and subscribing are the only allowed activities: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' });
        return
    }
    if (body.clientId === body.publisherId && body?.activity === "subscribe") {
        console.log(`Self-publishing is not allowed: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Self-publishing is not allowed' });
        return
    }
    if (body.clientId !== body.publisherId && body?.activity !== "subscribe") {
        console.log(`Publishing as someone else is not allowed: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Impersonation is not allowed' });
        return
    }
    if (body.activity == "publish") {
        const tokenRequest = await createAblyPublishTokenRequest(body.clientId)
        console.log(`Issued publish token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    } else {
        const tokenRequest = await createAblySubscribeTokenRequest(body.clientId, body.publisherId)
        console.log(`Issued subscribe token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    }
}
