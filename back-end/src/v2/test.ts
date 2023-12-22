// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {createAblyPublishTokenRequest, createAblySubscribeTokenRequest,} from "./auth.js";
import {getClientData} from '../client.js'
import {createTestClient} from '../test.js'


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

export async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['ably']
    }
    if (tests.includes('ably')) {
        await testAbly()
    }
}
