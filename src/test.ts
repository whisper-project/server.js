// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import assert from 'assert'
import {randomUUID} from 'crypto'
import express from 'express'


import {
    createAblyPublishTokenRequest, createAblySubscribeTokenRequest,
    createApnsJwt,
    createClientJwt,
    makeNonce,
    validateApnsJwt,
    validateClientJwt
} from "./auth.js";
import {ClientData, getApnsRequestData, getClientData, getDb, setClientData} from './db.js'
import {loadSettings} from './settings.js'
import {sendSecretToClient} from './apns.js'

async function createTestClient() {
    const uuid = randomUUID()
    const clientKey = `testClientId:${uuid}`
    const clientData: ClientData = {
        id: uuid,
        deviceId: Math.random().toString(16).substring(2, 10),
        token: await makeNonce(),
        tokenDate: Date.now() - (2 * 24 * 60 * 60 * 1000),
        secret: await makeNonce(),
        secretDate: Date.now() - (2 * 24 * 60 * 60 * 1000) + 5 * 1000,
    }
    await setClientData(clientKey, clientData)
    return clientKey
}

async function deleteTestClients() {
    const rc = await getDb()
    const keys = await rc.keys('testClientId:*')
    await rc.del(keys)
}

async function testJwt() {
    const jwt = await createApnsJwt()
    console.log('APNS jwt:', jwt)
    assert(await validateApnsJwt(jwt), `Failed to validate APNS jwt`)
    const clientKey1 = await createTestClient()
    const clientKey2 = await createTestClient()
    const jwt1 = await createClientJwt(clientKey1)
    const jwt2 = await createClientJwt(clientKey2)
    console.log('Client1 JWT:', jwt1)
    console.log('Client2 JWT:', jwt2)
    assert(await validateClientJwt(jwt1, clientKey1), `Failed to validate Client1 jwt`)
    assert(await validateClientJwt(jwt2, clientKey2), `Failed to validate Client2 jwt`)
    assert(!await validateClientJwt(jwt1, clientKey2), `Validated Client1 jwt as Client2`)
}

async function testApns() {
    const server = express().post('/3/device/:tokenId', mockApnsRoute).listen(2197)
    const clientKey = await createTestClient()
    const rc = await getDb()
    await rc.hDel(clientKey, ['secret', 'secretDate'])
    const updated = await sendSecretToClient(clientKey)
    const clientData = await getClientData(clientKey)
    assert(clientData && clientData?.pushId, `pushId wasn't recorded on client during update`)
    const requestId = `apnsRequestId:${clientData.pushId}`
    const requestData = await getApnsRequestData(requestId)
    server.closeAllConnections()
    server.removeAllListeners()
    if (!updated) {
        console.log(`Update failed: ${JSON.stringify(requestData)}`)
        throw Error(`Update of secret for ${clientKey} failed!`)
    }
}

async function mockApnsRoute(req: express.Request, res: express.Response) {
    const auth = req.header('authorization')
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        res.status(403).send({status: 'error', reason: 'Invalid authorization'})
        return
    }
    const jwt = auth.substring(7)
    if (!await validateApnsJwt(jwt)) {
        res.status(403).send({status: 'error', reason: 'Invalid jwt'})
        return
    }
    const apnsId = req.header('apns-id')
    if (!apnsId) {
        res.status(400).send({status: 'error', reason: 'No apns-id header in request'})
        return
    }
    res.setHeader('apns-id', apnsId)
    res.setHeader('apns-unique-id', randomUUID())
    res.status(200).send()
}

async function testAbly() {
    const clientKey1 = await createTestClient()
    const clientData1 = await getClientData(clientKey1)
    const tokenRequest1 = await createAblyPublishTokenRequest(clientData1!.id)
    console.log(`Created publish token request: ${JSON.stringify(tokenRequest1)}`)
    const clientKey2 = await createTestClient()
    const clientData2 = await getClientData(clientKey2)
    const tokenRequest2 = await createAblySubscribeTokenRequest(clientData2!.id, clientData1!.id)
    console.log(`Created subscribe token request: ${JSON.stringify(tokenRequest2)}`)
}

async function testAll(...tests: string[]) {
    loadSettings('test')
    if (tests.length == 0) {
        tests = ['jwt', 'apns', 'ably']
    }
    if (tests.includes('jwt')) {
        await testJwt()
    }
    if (tests.includes('apns')) {
        await testApns()
    }
    if (tests.includes('ably')) {
        await testAbly()
    }
    await deleteTestClients()
}

testAll(...process.argv.slice(2))
    .then(() => console.log("Tests completed with no errors"))
