// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {ClientData, getClientData, incrementErrorCounts, setClientData} from './db.js'
import {sendSecretToClient} from './apns.js'
import {createAblyPublishTokenRequest, createAblySubscribeTokenRequest, validateClientJwt} from './auth.js'
import {randomUUID} from 'crypto'
import {subscribe_response} from './templates.js';

export async function apnsToken(req: express.Request, res: express.Response)  {
    const body: { [p: string]: string } = req.body
    if (!body?.token || !body?.deviceId || !body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const { token, deviceId, clientId, lastSecret } = body
    const clientKey = `cli:${clientId}`
    const tokenHex = Buffer.from(token, 'base64').toString('hex')
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    const received: ClientData = {
        id: clientId,
        deviceId,
        token: tokenHex,
        tokenDate: Date.now(),
        lastSecret: secretHex,
        userName: body?.userName || '',
        appInfo: body?.appInfo || '',
    }
    const existing = await getClientData(clientKey)
    // see refreshSecret for explanation of logic around lastSecret
    let clientChanged = false
    let changeReason = ""
    if (!existing) {
        clientChanged = true
        changeReason = "APNS token from new"
    }
    if (!clientChanged && received.lastSecret !== existing?.lastSecret) {
        clientChanged = true
        changeReason = "unconfirmed secret from existing"
    }
    if (!clientChanged && received.token !== existing?.token) {
        clientChanged = true
        changeReason = "new APNS token from existing"
    }
    if (!clientChanged && received.deviceId !== existing?.deviceId) {
        clientChanged = true
        changeReason = "new device ID from existing"
    }
    if (!clientChanged && received.userName !== existing?.userName) {
        clientChanged = true
        changeReason = "new user data from existing"
    }
    if (!clientChanged && received.appInfo !== existing?.appInfo) {
        clientChanged = true
        changeReason = "new build data from existing"
    }
    const appInfo = body?.appInfo ? ` (${body.appInfo})` : ''
    if (clientChanged) {
        console.log(`Received ${changeReason} client ${clientKey}${appInfo}`)
        await setClientData(clientKey, received)
    } else {
        console.log(`Received APNS token from unchanged client ${clientKey}${appInfo}`)
    }
    await incrementErrorCounts(body)
    res.setHeader("Content-Type", "text/plain")
    res.status(204).send(appInfo)
    await sendSecretToClient(clientKey, clientChanged)
}

export async function apnsReceivedNotification(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.lastSecret) {
        console.log(`Missing key in received notification post: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const { clientId, lastSecret } = body
    const clientKey = `cli:${clientId}`
    const secretHex = Buffer.from(lastSecret, 'base64').toString('hex')
    // see refreshSecret for details of this logic
    const received: ClientData = { id: clientId, secretDate: Date.now(), lastSecret: secretHex }
    await setClientData(clientKey, received)
    console.log(`Received confirmation of received notification from client ${clientKey}`)
    res.status(204).send()
}

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.activity || !body?.publisherId) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
        return
    }
    const { clientId, activity, publisherId } = body
    const clientKey = `cli:${clientId}`
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
    if (activity !== 'publish' && activity !== 'subscribe') {
        console.log(`Publishing and subscribing are the only allowed activities: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' });
        return
    }
    if (clientId === publisherId && activity === 'subscribe') {
        console.log(`Self-publishing is not allowed: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Self-publishing is not allowed' });
        return
    }
    if (clientId !== publisherId && activity !== 'subscribe') {
        console.log(`Publishing as someone else is not allowed: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Impersonation is not allowed' });
        return
    }
    const existing = await getClientData(clientKey)
    if (body?.userName && body.userName !== existing?.userName) {
        if (activity === 'publish') {
            console.log(`Updating whisperer name from request`)
        } else {
            console.log(`Updating listener name from request`)
        }
        const update: ClientData = { id: clientId, userName: body?.userName }
        await setClientData(clientKey, update)
    }
    if (activity === 'publish') {
        const tokenRequest = await createAblyPublishTokenRequest(clientId)
        console.log(`Issued publish token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    } else {
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, publisherId)
        console.log(`Issued subscribe token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    }
}

export async function subscribeToPublisher(req: express.Request, res: express.Response) {
    function setCookie(name: string, value: string) {
        res.cookie(name, value, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
    }
    const publisherId = req.params?.publisherId
    if (!publisherId || publisherId.match(/^[-0-9a-zA-Z]{36}$/) === null) {
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    const publisherKey = `cli:${publisherId}`
    const existing = await getClientData(publisherKey)
    if (!existing) {
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    const publisherName = existing?.userName || 'Unknown Whisperer'
    let clientId = req?.session?.clientId
    if (!clientId) {
        clientId = randomUUID().toUpperCase()
    }
    req.session = { clientId, publisherId }
    setCookie('publisherId', publisherId)
    setCookie('publisherName', publisherName)
    setCookie('clientId', clientId)
    setCookie('clientName', req.cookies?.clientName || '')
    const body = subscribe_response(publisherName)
    res.status(200).send(body)
}

export async function subscribeTokenRequest(req: express.Request, res: express.Response) {
    const clientId = req?.session?.clientId
    const publisherId = req?.session?.publisherId
    if (!clientId || !publisherId) {
        res.status(403).send({ status: 'error', reason: 'no session to support authentication' })
        return
    }
    const tokenRequest = await createAblySubscribeTokenRequest(clientId, publisherId)
    res.status(200).send(tokenRequest)
}
