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
    assert(pubRequest.capability[`${conversationId}:control`].contains('publish'),
        "Publish token doesn't authorize control channel publish")
    assert(pubRequest.capability[`${conversationId}:control`].contains('subscribe'),
        "Publish token doesn't authorize control channel subscribe")
    assert(!pubRequest.capability[`${conversationId}:control`].contains('presence'),
        "Publish token authorizes control channel presence")
    assert(pubRequest.capability[`${conversationId}:${contentId}`].contains('publish'),
        "Publish token doesn't authorize content channel publish")
    assert(!pubRequest.capability[`${conversationId}:${contentId}`].contains('subscribe'),
        "Publish token authorizes control content subscribe")
    assert(!pubRequest.capability[`${conversationId}:${contentId}`].contains('presence'),
        "Publish token authorizes control channel presence")
    const subRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
    assert(subRequest.clientId === clientId, "Subscribe token's client key is wrong")
    assert(subRequest.capability[`${conversationId}:control`].contains('publish'),
        "Subscribe token doesn't authorize control channel publish")
    assert(subRequest.capability[`${conversationId}:control`].contains('subscribe'),
        "Subscribe token doesn't authorize control channel subscribe")
    assert(!subRequest.capability[`${conversationId}:control`].contains('presence'),
        "Subscribe token authorizes control channel presence")
    assert(!subRequest.capability[`${conversationId}:*`].contains('publish'),
        "Subscribe token authorizes content channel publish")
    assert(subRequest.capability[`${conversationId}:*`].contains('subscribe'),
        "Subscribe token doesn't authorize control content subscribe")
    assert(!subRequest.capability[`${conversationId}:*`].contains('presence'),
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
