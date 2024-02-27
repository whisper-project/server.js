// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { createAblyPublishTokenRequest, createAblySubscribeTokenRequest } from './auth.js'
import { getClientData } from '../client.js'
import { createTestClient } from '../test.js'
import assert from 'assert'


async function testAbly() {
    const clientKey1 = await createTestClient()
    const clientData1 = await getClientData(clientKey1)
    const clientId1 = clientData1!.id
    const pubRequest = await createAblyPublishTokenRequest(clientId1)
    const pubCaps = JSON.parse(pubRequest.capability)
    assert(pubCaps[`${clientId1}:whisper`].includes('publish'),
        'Publish token doesn\'t authorize channel publish')
    assert(pubCaps[`${clientId1}:whisper`].includes('subscribe'),
        'Publish token doesn\'t authorize channel subscribe')
    assert(pubCaps[`${clientId1}:whisper`].includes('presence'),
        'Publish token doesn\'t authorize channel presence')
    const clientKey2 = await createTestClient()
    const clientData2 = await getClientData(clientKey2)
    const clientId2 = clientData2!.id
    const subRequest = await createAblySubscribeTokenRequest(clientId2, clientId1)
    const subCaps = JSON.parse(subRequest.capability)
    assert(subCaps[`${clientId1}:whisper`].includes('publish'),
        'Publish token doesn\'t authorize channel publish')
    assert(subCaps[`${clientId1}:whisper`].includes('subscribe'),
        'Publish token doesn\'t authorize channel subscribe')
    assert(subCaps[`${clientId1}:whisper`].includes('presence'),
        'Publish token doesn\'t authorize channel presence')
}

export async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['ably']
    }
    if (tests.includes('ably')) {
        await testAbly()
    }
}
