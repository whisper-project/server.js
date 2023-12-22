// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import {randomUUID} from 'crypto'

import {createAblyPublishTokenRequest, createAblySubscribeTokenRequest} from './auth.js'
import {subscribe_response} from './templates.js'
import {ClientData, getClientData, setClientData} from '../client.js'
import {validateClientJwt} from '../auth.js'

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

export async function listenToPublisher(req: express.Request, res: express.Response) {
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
