// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {createAblyPublishTokenRequest, createAblySubscribeTokenRequest,} from "./auth.js";
import {randomUUID} from 'crypto'
import assert from 'assert'


async function testAbly() {
    const clientId = randomUUID()
    const conversationId = randomUUID()
    const contentId = randomUUID()
    const pubRequest = await createAblyPublishTokenRequest(clientId, conversationId, contentId)
    assert(pubRequest.clientId === clientId, "Publish token's client key is wrong")
    const pubCaps = JSON.parse(pubRequest.capability)
    assert(pubCaps[`${conversationId}:control`].includes('publish'),
        "Publish token doesn't authorize control channel publish")
    assert(pubCaps[`${conversationId}:control`].includes('subscribe'),
        "Publish token doesn't authorize control channel subscribe")
    assert(!pubCaps[`${conversationId}:control`].includes('presence'),
        "Publish token authorizes control channel presence")
    assert(pubCaps[`${conversationId}:${contentId}`].includes('publish'),
        "Publish token doesn't authorize content channel publish")
    assert(!pubCaps[`${conversationId}:${contentId}`].includes('subscribe'),
        "Publish token authorizes control content subscribe")
    assert(!pubCaps[`${conversationId}:${contentId}`].includes('presence'),
        "Publish token authorizes control channel presence")
    const subRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
    assert(subRequest.clientId === clientId, "Subscribe token's client key is wrong")
    const subCaps = JSON.parse(subRequest.capability)
    assert(subCaps[`${conversationId}:control`].includes('publish'),
        "Subscribe token doesn't authorize control channel publish")
    assert(subCaps[`${conversationId}:control`].includes('subscribe'),
        "Subscribe token doesn't authorize control channel subscribe")
    assert(!subCaps[`${conversationId}:control`].includes('presence'),
        "Subscribe token authorizes control channel presence")
    assert(!subCaps[`${conversationId}:*`].includes('publish'),
        "Subscribe token authorizes content channel publish")
    assert(subCaps[`${conversationId}:*`].includes('subscribe'),
        "Subscribe token doesn't authorize control content subscribe")
    assert(!subCaps[`${conversationId}:*`].includes('presence'),
        "Subscribe token authorizes control channel presence")
}

export async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['ably']
    }
    if (tests.includes('ably')) {
        await testAbly()
    }
}
