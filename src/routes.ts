// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {ClientData, getClientData, setClientData} from './db.js'
import {sendSecretToClient} from './apns.js'

export async function apnsToken(req: express.Request, res: express.Response)  {
    const body = req.body
    if (!body?.token || !body?.deviceId || !body?.clientId) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(body)}`)
        res.status(400).send({
            status: 'error',
            reason: 'Invalid post data'
        });
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