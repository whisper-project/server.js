// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import { randomUUID } from 'crypto'

import { createAblyPublishTokenRequest, createAblySubscribeTokenRequest } from './auth.js'
import { subscribeResponse } from './templates.js'
import { ClientData, getClientData, setClientData } from '../client.js'
import { validateClientAuth } from '../auth.js'

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.activity || !body?.publisherId) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid post data' })
        return
    }
    const { clientId, activity, publisherId } = body
    console.log(`Token request received from client ${clientId}`)
    if (!await validateClientAuth(req, res, clientId)) return
    const existing = await getClientData(clientId)
    if (body?.userName && body.userName !== existing?.userName) {
        console.log(`Updating username from request`)
        const update: ClientData = { id: clientId, userName: body?.userName }
        await setClientData(update)
    }
    if (activity.toLowerCase() == 'publish') {
        if (clientId !== publisherId) {
            console.log(`Publishing as someone else is not allowed: ${JSON.stringify(body)}`)
            res.status(400).send({ status: 'error', reason: 'Impersonation is not allowed' })
            return
        }
        const tokenRequest = await createAblyPublishTokenRequest(clientId)
        console.log(`Issued publish token request to client ${clientId}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else if (activity.toLowerCase() == 'subscribe') {
        if (clientId === publisherId) {
            console.log(`Self-publishing is not allowed: ${JSON.stringify(body)}`)
            res.status(400).send({ status: 'error', reason: 'Self-publishing is not allowed' })
            return
        }
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, publisherId)
        console.log(`Issued subscribe token request to client ${clientId}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else {
        console.log(`Publish and Subscribe are the only allowed activities: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' })
        return
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
        console.log(`Making new web client: ${clientId}`)
    }
    console.log(`Issuing listen page for publisher ${publisherId} to client ${clientId}`)
    req.session = { clientId, publisherId }
    setCookie('publisherId', publisherId)
    setCookie('publisherName', publisherName)
    setCookie('clientId', clientId)
    setCookie('clientName', req.cookies?.clientName || '')
    const body = subscribeResponse(publisherName)
    res.status(200).send(body)
}

export async function subscribeTokenRequest(req: express.Request, res: express.Response) {
    const clientId = req?.session?.clientId
    const publisherId = req?.session?.publisherId
    if (!clientId || !publisherId) {
        console.error(`Failing subscribe token request with no session information from web client ${clientId}`)
        res.status(403).send({ status: 'error', reason: 'no session to support authentication' })
        return
    }
    console.log(`Issuing subscribe token to web client ${clientId}`)
    const tokenRequest = await createAblySubscribeTokenRequest(clientId, publisherId)
    res.status(200).send(tokenRequest)
}
