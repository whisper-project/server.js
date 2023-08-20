// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'

import {rc} from "./index.js";

export async function apnsToken(req: express.Request, res: express.Response)  {
    const data = req.body
    if (!data?.apnsToken || !data?.deviceId || !data?.clientId) {
        console.log(`Missing key in posted apnsToken body: ${JSON.stringify(data)}`)
        res.status(400).send({
            status: 'error',
            reason: 'Posted apns data must include client id, device id, and apns token'
        });
        return
    }
    await rc.hSet(`clientId:${data.clientId}`, { deviceId: data.deviceId, apnsToken: data.apnsToken })
    res.status(200).send({
        status: 'success',
        info: `Saved data for client clientId:${data.clientId}`
    })
}