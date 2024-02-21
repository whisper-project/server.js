// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import { randomUUID } from 'crypto'

import { createAblyPublishTokenRequest, createAblySubscribeTokenRequest } from './auth.js'
import { subscribe_response } from './templates.js'
import { validateClientAuth, validateProfileAuth } from '../auth.js'
import {
    ConversationInfo,
    getConversationInfo,
    getProfileData,
    ProfileData,
    saveProfileData,
    setConversationInfo,
} from '../profile.js'

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.activity || !body?.conversationId || !body.profileId) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid pub-sub POST data' });
        return
    }
    const { clientId, activity, conversationId } = body
    console.log(`Token v2 request received from application client ${clientId}`)
    if (!await validateClientAuth(req, res, clientId)) return
    if (activity.toLowerCase() == 'publish') {
        if (!body?.conversationName || !body?.contentId || !body.username) {
            console.log(`Missing key in publish token request body: ${JSON.stringify(body)}`)
            res.status(400).send({ status: 'error', reason: 'Invalid publish POST data' });
            return
        }
        console.log(`Saving conversation data for conversation ${conversationId}`)
        const info: ConversationInfo = {
            id: conversationId, name: body.conversationName, ownerId: body.profileId, ownerName: body.username
        }
        await setConversationInfo(info)
        console.log(`Issuing publish token request to Whisperer ${body.profileId}`)
        const tokenRequest = await createAblyPublishTokenRequest(clientId, conversationId, body.contentId)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    } else if (activity.toLowerCase() == 'subscribe') {
        console.log(`Issuing subscribe token request to Listener ${body.profileId}`)
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    } else {
        console.error(`Publish and Subscribe are the only allowed activities: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' });
    }
}

export async function listenToConversation(req: express.Request, res: express.Response) {
    function setCookie(name: string, value: string) {
        res.cookie(name, value, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
    }
    const conversationId = req.params?.conversationId
    if (!conversationId || !conversationId.match(/^[-0-9a-zA-Z]{36}$/)) {
        console.error(`Received listen link for invalid conversation id ${conversationId}`)
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    const info = await getConversationInfo(conversationId)
    if (!info) {
        console.error(`Received listen link for unknown conversation ${conversationId}`)
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    let clientId = req?.session?.clientId
    if (!clientId) {
        clientId = randomUUID().toUpperCase()
        console.log(`Created new client for web: ${clientId}`)
    }
    console.log(`Sending listen page for conversation ${conversationId} to client ${clientId}`)
    req.session = { clientId, conversationId }
    setCookie('conversationId', conversationId)
    setCookie('conversationName', info.name)
    setCookie('whispererName', info.ownerName)
    setCookie('clientId', clientId)
    setCookie('clientName', req.cookies?.clientName || '')
    const body = subscribe_response(info.name, info.ownerName)
    res.status(200).send(body)
}

export async function listenTokenRequest(req: express.Request, res: express.Response) {
    const clientId = req?.session?.clientId
    const conversationId = req?.session?.conversationId
    if (!clientId || !conversationId) {
        console.error("Refusing listen token request outside of session")
        res.status(403).send({ status: 'error', reason: 'no session to support authentication' })
        return
    }
    console.log(`Listen token request from web client ${clientId} to conversation ${conversationId}`)
    const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
    res.status(200).send(tokenRequest)
}

export async function userProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body.id || !body.name || !body.password) {
        console.log(`User profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.name) {
        console.error(`User profile POST for ${body.id} from client ${clientId} but the profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        name: body.name,
        password: body.password
    }
    await saveProfileData(newData)
    console.log(`Successful POST of user profile ${body.id} from client ${clientId}`)
    res.status(201).send()
}

export async function userProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    const profileId = req.params?.profileId
    if (!profileId || !body?.name) {
        console.log(`User profile PUT from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid PUT data` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData.password) {
        console.error(`User profile PUT for ${profileId} from client ${clientId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    console.log(`Successful PUT of user profile ${existingData.id} from client ${clientId}`)
    existingData.name = body.name
    await saveProfileData(existingData)
    res.status(204).send()
}

export async function userProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.name || !existingData?.password) {
        console.error(`User profile GET from client ${clientId} for profile ${profileId} but it does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.name}"`) {
        console.log(`User profile name matches name from client ${clientId}, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server name matches client name`})
        return
    }
    console.log(`Successful GET of user profile ${existingData.id} from client ${clientId}`)
    const body = { id: existingData.id, name: existingData.name }
    res.setHeader("ETag", `"${existingData.name}"`)
    res.status(200).send(body)
}

export async function whisperProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Whisper profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.whisperProfile) {
        console.error(`Whisper profile POST for ${body.id} from client ${clientId} but the whisper profile exists`)
        res.status(409).send({status: `error`, reason: `Whisper profile ${body.id} already exists`})
        return
    }
    console.log(`Successful POST of whisper profile ${body.id} from client ${clientId}`)
    const newData: ProfileData = {
        id: body.id,
        whisperTimestamp: body.timestamp,
        whisperProfile: JSON.stringify(body)
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function whisperProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Whisper profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` });
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Whisper profile PUT from client ${clientId} is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp`})
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.whisperTimestamp || !existingData?.whisperProfile) {
        console.error(`Whisper profile PUT for ${profileId} from client ${clientId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Whisper profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    if (existingData.whisperTimestamp > req.body.timestamp) {
        console.error(`PUT of whisper profile from ${clientId} has older timestamp`)
        res.status(409).send({status: `error`, reason: `Newer whisper profile version on server`})
    }
    console.log(`Successful PUT of whisper profile ${existingData.id} from client ${clientId}`)
    const newData: ProfileData = {
        id: existingData.id,
        whisperTimestamp: req.body.timestamp,
        whisperProfile: JSON.stringify(req.body),
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function whisperProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.whisperTimestamp || !existingData.whisperProfile) {
        console.error(`Whisper profile get for ${profileId} from client ${clientId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Whisper profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.whisperTimestamp}"`) {
        console.log(`Whisper profile timestamp matches timestamp from client ${clientId}, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server whisper timestamp matches client timestamp`})
        return
    }
    console.log(`Successful GET of whisper profile ${existingData.id} from client ${clientId}`)
    res.setHeader("ETag", `"${existingData.whisperTimestamp}"`)
    const body = JSON.parse(existingData.whisperProfile)
    res.status(200).send(body)
}

export async function listenProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Listen profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.listenProfile) {
        console.error(`Listen profile POST for ${body.id} from ${clientId} but the listen profile exists`)
        res.status(409).send({status: `error`, reason: `Listen profile ${body.id} already exists`})
        return
    }
    console.log(`Successful POST of listen profile ${body.id} from client ${clientId}`)
    const newData: ProfileData = {
        id: body.id,
        listenTimestamp: body.timestamp,
        listenProfile: JSON.stringify(body)
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function listenProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Listen profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` });
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Listen profile PUT from client ${clientId} is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp`})
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.listenTimestamp || !existingData?.listenProfile) {
        console.error(`Listen profile PUT for ${profileId} from client ${clientId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Listen profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    if (existingData.listenTimestamp > req.body.timestamp) {
        console.error(`Post of listen profile from client ${clientId} has older timestamp`)
        res.status(409).send({status: `error`, reason: `Newer listen profile version on server`})
    }
    console.log(`Successful PUT of listen profile ${existingData.id} from client ${clientId}`)
    const newData: ProfileData = {
        id: existingData.id,
        listenTimestamp: req.body.timestamp,
        listenProfile: JSON.stringify(req.body),
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function listenProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.listenTimestamp || !existingData.listenProfile) {
        console.error(`Listen profile get for ${profileId} from client ${clientId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Listen profile ${profileId} doesn't exist`})
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.listenTimestamp}"`) {
        console.log(`Listen profile timestamp matches timestamp from client ${clientId}, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server listen timestamp matches client timestamp`})
        return
    }
    console.log(`Successful GET of listen profile ${existingData.id} from client ${clientId}`)
    res.setHeader("ETag", `"${existingData.listenTimestamp}"`)
    const body = JSON.parse(existingData.listenProfile)
    res.status(200).send(body)
}
