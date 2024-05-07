// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import * as jose from 'jose'
import { randomBytes, randomUUID } from 'crypto'

import { ClientData, getClientData, setClientData } from './client.js'
import { getSettings } from './settings.js'
import express from 'express'

export async function createApnsJwt() {
    const alg = 'ES256'
    const config = getSettings()
    const privateKey = await jose.importPKCS8(config.apnsCredSecret, alg)
    return await new jose.SignJWT({})
        .setProtectedHeader({ alg, kid: config.apnsCredId })
        .setIssuer(config.apnsTeamId)
        .setIssuedAt()
        .sign(privateKey)
}

export async function validateApnsJwt(jwt: string) {
    const alg = 'ES256'
    const config = getSettings()
    const privateKey = await jose.importPKCS8(config.apnsCredSecret, alg)
    try {
        await jose.jwtVerify(jwt, privateKey)
        return true
    } catch (err) {
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
            console.log(`Invalid APNS JWT: ${err}`)
            return false
        }
        throw err
    }
}

export async function validateClientAuth(req: express.Request, res: express.Response, clientId: string) {
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return false
    }
    if (!await validateClientJwt(auth.substring(7), clientId)) {
        console.log(`Client JWT failed to validate`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization' })
        return false
    }
    return true
}

export async function validateProfileAuth(req: express.Request, res: express.Response, password: string) {
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return false
    }
    if (auth.substring(7) != password) {
        console.error(`User profile ${req.method} has incorrect password`)
        res.status(403).send({ status: `error`, reason: `Invalid authorization` })
        return false
    }
    return true
}

export async function createClientJwt(clientKey: string) {
    const alg = 'HS256'
    const clientData = await getClientData(clientKey)
    if (!clientData || !clientData?.secret) {
        throw Error(`Can't make a JWT for secret-less client ${clientKey}`)
    }
    const privateKey = Buffer.from(clientData.secret, 'hex')
    return await new jose.SignJWT({})
        .setProtectedHeader({ alg })
        .setIssuer(clientData.id)
        .setIssuedAt()
        .sign(privateKey)
}

export async function validateClientJwt(jwt: string, clientId: string) {
    const clientData = await getClientData(clientId)
    if (!clientData || !clientData?.id || !clientData?.secret || !clientData?.lastSecret) {
        throw Error(`Can't validate a JWT for an invalid client ${clientId}`)
    }
    // see refreshSecret for why we try this twice with different keys
    for (const secret of [clientData.secret, clientData.lastSecret]) {
        const privateKey = Buffer.from(secret, 'hex')
        try {
            await jose.jwtVerify(jwt, privateKey, { issuer: clientData.id })
            return true
        } catch (err) {
            if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
                if (secret === clientData.secret) {
                    console.log(`Validation of JWT with current secret failed: ${err}`)
                    continue
                } else {
                    console.log(`Validation of JWT with last secret failed: ${err}`)
                    return false
                }
            }
            throw err
        }
    }
}

export interface RefreshSecretResponse {
    didRefresh: boolean,
    clientData: ClientData
}

export async function refreshSecret(clientId: string, force: boolean = false) {
    // Secrets rotate.  The client generates its first secret, and always
    // sets that as both the current and prior secret.  After that, every
    // time the server sends a new secret, the current secret rotates to
    // be the prior secret.  The client sends the prior secret with every launch,
    // because this allows the server to know when the client has gone out of sync
    // (for example, when a client moves from apns dev to apns prod),
    // and the server rotates the secret when that happens.  Clients sign auth requests
    // with the current secret, but the server allows use of the prior
    // secret as a one-time fallback when the client has gone out of sync.
    const clientData = await getClientData(clientId)
    if (!clientData || !clientData?.token) {
        throw Error(`Can't have a secret without a device token: ${clientId}`)
    }
    if (force || !clientData?.secret || !clientData?.secretDate) {
        if (clientData?.secret && !clientData?.secretDate) {
            // a secret has been issued for this client, but it's never been received.
            // since these are often sent twice, it's important not to change it in case
            // there was simply a delay in responding to the notification.
            console.log(`Reusing the sent-but-never-received secret for client ${clientId}`)
        } else {
            console.log(`Issuing a new secret for client ${clientId}`)
            clientData.secret = await makeNonce()
            clientData.secretDate = 0
        }
        clientData.pushId = randomUUID()
        await setClientData(clientData)
        return { didRefresh: true, clientData } as RefreshSecretResponse
    }
    return { didRefresh: false, clientData } as RefreshSecretResponse
}

export async function makeNonce() {
    return randomBytes(32).toString('hex')
}
