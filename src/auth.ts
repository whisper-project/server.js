// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import * as jose from 'jose'
import * as Ably from 'ably/promises.js'
import {randomBytes, randomUUID} from 'crypto';

import {ClientData, getClientData, setClientData} from './db.js'
import {getSettings} from './settings.js'

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
    }
    catch (err) {
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
            console.log(`Invalid APNS JWT: ${err}`)
            return false
        }
        throw err
    }
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

export async function validateClientJwt(jwt: string, clientKey: string) {
    const clientData = await getClientData(clientKey)
    if (!clientData || !clientData?.id || !clientData?.secret) {
        throw Error(`Can't validate a JWT for an invalid client ${clientKey}`)
    }
    const privateKey = Buffer.from(clientData.secret, 'hex')

    try {
        await jose.jwtVerify(jwt, privateKey, { issuer: clientData.id })
        return true
    }
    catch (err) {
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
            console.log(`Invalid client JWT: ${err}`)
            return false
        }
        throw err
    }
}

export interface RefreshSecretResponse {
    didRefresh: boolean,
    clientData: ClientData
}

export async function refreshSecret(clientKey: string, force: boolean = false) {
    const clientData = await getClientData(clientKey)
    if (!clientData || !clientData?.token || !clientData?.tokenDate) {
        throw Error(`Can't have a secret without a dated device token: ${clientKey}`)
    }
    if (force || !clientData?.secretDate || clientData.secretDate <= clientData.tokenDate) {
        console.log(`Issuing a new secret for client ${clientKey}`)
        clientData.secret = await makeNonce()
        clientData.secretDate = Date.now()
        clientData.pushId = randomUUID()
        await setClientData(clientKey, clientData)
        return { didRefresh: true, clientData } as RefreshSecretResponse
    }
    return { didRefresh: false, clientData } as RefreshSecretResponse
}

export async function makeNonce() {
    return randomBytes(32).toString('hex')
}

export async function createAblyPublishTokenRequest(clientId: string) {
    const config = getSettings()
    const ably = new Ably.Rest({ key: config.ablyPublishKey })
    const tokenCaps = {}
    tokenCaps[`whisper:${clientId}:*`] = ['publish', 'subscribe', 'presence']
    const tokenParams = {
        clientId,
        capability: JSON.stringify(tokenCaps)
    }
    return await ably.auth.createTokenRequest(tokenParams)
}

export async function createAblySubscribeTokenRequest(clientId: string, publisherId: string) {
    const config = getSettings()
    const ably = new Ably.Rest({ key: config.ablyPublishKey })
    const tokenCaps = {}
    tokenCaps[`whisper:${publisherId}:*`] = ['subscribe']
    const tokenParams = {
        clientId,
        capability: JSON.stringify(tokenCaps)
    }
    return await ably.auth.createTokenRequest(tokenParams)
}
