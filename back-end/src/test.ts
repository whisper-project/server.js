// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { randomUUID } from 'crypto'
import assert from 'assert'
import express from 'express'
import { fetch } from 'fetch-h2'

import { createApnsJwt, createClientJwt, makeNonce, validateApnsJwt, validateClientJwt } from './auth.js'
import { getDb } from './db.js'
import { loadSettings } from './settings.js'
import { ClientData, getClientData, setClientData } from './client.js'
import { getApnsRequestData } from './apns.js'
import { apnsToken } from './routes.js'
import { asyncWrapper } from './middleware.js'

import { testAll as test1 } from './v1/test.js'
import { testAll as test2 } from './v2/test.js'

export async function createTestClient() {
    const uuid = randomUUID()
    const clientData: ClientData = {
        id: uuid,
        token: await makeNonce(),
        secret: await makeNonce(),
        lastSecret: await makeNonce(),
        secretDate: Date.now() - (2 * 24 * 60 * 60 * 1000) + 5 * 1000,
    }
    await setClientData(clientData)
    return uuid
}

async function testJwt() {
    const jwt = await createApnsJwt()
    console.log('APNS jwt:', jwt)
    assert(await validateApnsJwt(jwt), `Failed to validate APNS jwt`)
    const client1 = await createTestClient()
    const client2 = await createTestClient()
    const jwt1 = await createClientJwt(client1)
    const jwt2 = await createClientJwt(client2)
    console.log('Client1 JWT:', jwt1)
    console.log('Client2 JWT:', jwt2)
    assert(await validateClientJwt(jwt1, client1), `Failed to validate Client1 jwt`)
    assert(await validateClientJwt(jwt2, client2), `Failed to validate Client2 jwt`)
    assert(!await validateClientJwt(jwt1, client2), `Validated Client1 jwt as Client2`)
}

async function testApns() {
    const server = express()
        .use(express.json())
        .post('/apns', asyncWrapper(apnsToken))
        .post('/3/device/:tokenId', mockApnsRoute)
        .listen(2197)
    const clientId = await createTestClient()
    let clientData = await getClientData(clientId)
    assert(clientData, 'test client has no data')
    clientData.secretDate = 0
    await setClientData(clientData)
    const body = {
        clientId: clientData.id,
        token: clientData.token,
        lastSecret: clientData.lastSecret,
        appInfo: 'test-client',
    }
    const response1 = await fetch('http://localhost:2197/apns', { method: 'POST', json: body })
    const response2 = await fetch('http://localhost:2197/apns', { method: 'POST', json: body })
    assert(response1.status === 204, `Non-204 status from post of APNS token`)
    assert(response2.status === 204, `Non-204 status from post of APNS token`)
    assert(response2.headers.get('X-Received-Earlier'), `Second call wasn't caught as a duplicate`)
    await new Promise(resolve => setTimeout(resolve, 1000))
    clientData = await getClientData(clientId)
    assert(clientData && clientData.pushId, `pushId wasn't recorded on client during update`)
    const requestId = `req:${clientData.pushId}`
    const requestData = await getApnsRequestData(requestId)
    assert(requestData && requestData.id === clientData.pushId && requestData.status == 200)
    server.closeAllConnections()
    server.removeAllListeners()
}

async function mockApnsRoute(req: express.Request, res: express.Response) {
    const auth = req.header('authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        res.status(403).send({ status: 'error', reason: 'Invalid authorization' })
        return
    }
    const jwt = auth.substring(7)
    if (!await validateApnsJwt(jwt)) {
        res.status(403).send({ status: 'error', reason: 'Invalid jwt' })
        return
    }
    const apnsId = req.header('apns-id')
    if (!apnsId) {
        res.status(400).send({ status: 'error', reason: 'No apns-id header in request' })
        return
    }
    res.setHeader('apns-id', apnsId)
    res.setHeader('apns-unique-id', randomUUID())
    res.status(200).send()
}

async function deleteTestKeys() {
    const rc = await getDb()
    const keys = await rc.keys('t:*')
    if (keys.length) {
        await rc.del(keys)
    }
}

async function test0(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['jwt', 'apns']
    }
    if (tests.includes('jwt')) {
        await testJwt()
    }
    if (tests.includes('apns')) {
        await testApns()
    }
}

async function testAll(...tests: string[]) {
    loadSettings('test')
    await test0(...tests)
    await test1(...tests)
    await test2(...tests)
    await deleteTestKeys()
}

testAll(...process.argv.slice(2))
    .then(() => {
        console.log('Tests completed with no errors')
        process.exit(0)
    })
    .catch(reason => {
        console.error(`Tests failed: ${reason}`)
        process.exit(1)
    })
