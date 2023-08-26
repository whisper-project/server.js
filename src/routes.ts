// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {ClientData, getClientData, setClientData} from './db.js'
import {sendSecretToClient} from './apns.js'
import {validateClientJwt} from './auth.js'

export async function apnsToken(req: express.Request, res: express.Response)  {
    const body = req.body
    if (!body?.token || !body?.deviceId || !body?.clientId) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const clientKey = `clientKey:${body.clientId}`
    const tokenHex = Buffer.from(body.token, 'base64').toString('hex')
    const received: ClientData = { id: body.clientId, deviceId: body.deviceId, token: tokenHex, tokenDate: Date.now() }
    const existing = await getClientData(clientKey)
    if (!existing || received.token !== existing?.token || received.deviceId !== existing?.deviceId) {
        await setClientData(clientKey, received)
    }
    console.log(`Received APNS token and device ID from client ${clientKey}`)
    res.status(204).send()
    await sendSecretToClient(clientKey)
}

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body = req.body
    if (!body?.clientId || !body?.activity || !body?.publisherId) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const clientKey = `clientKey:${body.clientId}`
    console.log(`Token request received from clientID ${clientKey}`)
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (!validateClientJwt(auth.substring(7), clientKey)) {
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
    console.log(`Issued mock token request to client ${clientKey}`)
    res.status(200).send({ status: 'success', tokenRequest: 'this-is-your-mock-token-request'})
}