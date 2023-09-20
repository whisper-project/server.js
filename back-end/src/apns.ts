// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import {fetch} from 'fetch-h2'
import {createApnsJwt, refreshSecret} from './auth.js'
import {ApnsRequestData, setApnsRequestData} from './db.js'
import {getSettings} from './settings.js'

export async function sendSecretToClient(clientKey: string, force: boolean = false) {
    const config = getSettings()
    const { didRefresh, clientData } = await refreshSecret(clientKey, force)
    if (!didRefresh) {
        console.log(`Client ${clientKey} already has its secret`)
        return true
    }
    console.log(`Pushing secret to client ${clientKey}`)
    const server = config.apnsUrl
    const path = `/3/device/${clientData.token}`
    const secret64 = Buffer.from(clientData.secret!, 'hex').toString('base64')
    const body = {
        "aps" : {
            "content-available" : 1
        },
        "secret" : secret64,
    }
    const requestKey = `req:${clientData.pushId!}`
    const requestData: ApnsRequestData = {
        id: clientData.pushId!,
        clientKey,
        status: -1,
    }
    try {
        const response = await fetch(server + path, {
            method: "POST",
            mode: "same-origin",
            cache: "no-cache",
            credentials: "same-origin",
            headers: {
                'authorization': `Bearer ${await createApnsJwt()}`,
                'apns-id': clientData.pushId!,
                'apns-push-type': 'background',
                'apns-priority': '5',
                'apns-topic': 'io.clickonetwo.whisper'
            },
            redirect: 'error',
            json: body,
        });
        requestData.status = response.status
        const devId = response.headers.get('apns-unique-id')
        if (devId) {
            requestData.devId = devId
        }
        if (response.status >= 400) {
            const body = await response.json()
            requestData.reason = body.reason
            console.log(`APNS post failed with status ${response.status} and reason: ${body.reason}`)
            if (body?.timestamp) {
                requestData.timestamp = body.timestamp
            }
        } else {
            console.log(`APNS post completed with status ${response.status}`)
        }
    }
    catch (err) {
        console.log(`APNS post failed due to error: ${err}`)
    }
    await setApnsRequestData(requestKey, requestData)
    return requestData.status >= 200 && requestData.status < 300
}
