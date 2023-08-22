// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import * as jose from 'jose'
import {jwtVerify} from 'jose'
import {randomBytes, randomUUID} from 'crypto';
import {getClientData, setClientData} from './db.js'
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
        await jwtVerify(jwt, privateKey)
        return true
    }
    catch (err) {
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
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
    if (!clientData || !clientData?.secret) {
        throw Error(`Can't validate a JWT for secret-less client ${clientKey}`)
    }
    const privateKey = Buffer.from(clientData.secret, 'hex')

    try {
        await jose.jwtVerify(jwt, privateKey, { issuer: clientData.id })
        return true
    }
    catch (err) {
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
            return false
        }
        throw err
    }
}

export async function refreshSecret(clientKey: string, force: boolean = false) {
    const clientData = await getClientData(clientKey)
    if (!clientData || !clientData?.token || !clientData?.tokenDate) {
        throw Error(`Can't have a secret without a dated device token: ${clientKey}`)
    }
    if (force || !clientData?.secretDate || clientData.secretDate <= clientData.tokenDate) {
        clientData.secret = await makeNonce()
        clientData.secretDate = Date.now()
        clientData.pushId = randomUUID()
        await setClientData(clientKey, clientData)
    }
    return clientData
}

export async function makeNonce() {
    return randomBytes(32).toString('hex')
}
