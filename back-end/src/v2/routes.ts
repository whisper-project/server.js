// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
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
        console.log(`Missing key in pub-sub token request body from ${body?.clientId}: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid pub-sub POST data' })
        return
    }
    const { clientId, activity, conversationId } = body
    if (!await validateClientAuth(req, res, clientId)) {
        console.error(`Unauthorized token v2 request received from application client ${clientId}`)
        return
    }
    if (activity.toLowerCase() == 'publish') {
        if (!body?.conversationName || !body?.contentId || !body?.username) {
            console.log(`Missing key in publish token v2 request body from client ${clientId}: ${JSON.stringify(body)}`)
            res.status(400).send({ status: 'error', reason: 'Invalid publish POST data' })
            return
        }
        console.log(`Whisperer ${body.profileId} (${body.username}) ` +
            `is starting conversation ${conversationId} (${body.conversationName}) ` +
            `from client ${clientId}`)
        const info: ConversationInfo = {
            id: conversationId, name: body.conversationName, ownerId: body.profileId,
        }
        await setConversationInfo(info)
        const update: ProfileData = { id: body.profileId, name: body.username }
        await saveProfileData(update)
        const tokenRequest = await createAblyPublishTokenRequest(clientId, conversationId, body.contentId)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else if (activity.toLowerCase() == 'subscribe') {
        const existing = await getProfileData(body.profileId)
        console.log(`Listener ${body.profileId} (${existing?.name}) ` +
            `is looking for conversation ${conversationId} (${body.conversationName}) ` +
            `with client ${clientId}`)
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest) })
    } else {
        console.error(`Invalid activity in token v2 request from client {$clientId}: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' })
    }
}

export async function listenToConversation(req: express.Request, res: express.Response) {
    function setCookie(name: string, value: string) {
        res.cookie(name, value, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false })
    }

    const conversationId = req.params?.conversationId
    let haveConversationData = true
    if (!conversationId || !conversationId.match(/^[-0-9a-zA-Z]{36}$/)) {
        console.error(`Web browser is looking for invalid conversation ${conversationId}`)
        haveConversationData = false
    }
    const info = await getConversationInfo(conversationId)
    const profileData = info ? await getProfileData(info.ownerId) : undefined
    if (!info) {
        console.error(`Web browser is looking for unknown conversation ${conversationId}`)
        haveConversationData = false
    } else if (!profileData?.name) {
        console.error(`Web browser is looking for conversation ${conversationId} with unknown profile owner ${info.ownerId}`)
        haveConversationData = false
    }
    if (!haveConversationData) {
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    let clientId = req?.session?.clientId
    if (!clientId) {
        clientId = randomUUID().toUpperCase()
        console.log(`Created new client for web: ${clientId}`)
    }
    console.log(`Sending listen page for conversation ${conversationId} (${info!.name}) to web client ${clientId}`)
    req.session = { clientId, conversationId }
    setCookie('conversationId', conversationId)
    setCookie('conversationName', info!.name)
    setCookie('whispererName', profileData!.name!)
    setCookie('clientId', clientId)
    setCookie('clientName', req.cookies?.clientName || '')
    const body = subscribe_response(info!.name, profileData!.name!)
    res.status(200).send(body)
}

export async function listenTokenRequest(req: express.Request, res: express.Response) {
    const clientId = req?.session?.clientId
    const clientName = req?.cookies?.clientName || 'unknown'
    const conversationId = req?.session?.conversationId
    const conversationName = req?.cookies?.conversationName || 'unknown'
    if (!clientId || !conversationId) {
        console.error('Refusing listen token request outside of session')
        res.status(403).send({ status: 'error', reason: 'no session to support authentication' })
        return
    }
    console.log(`Listen token request from web client ${clientId} (${clientName}) ` +
        `to conversation ${conversationId} (${conversationName})`)
    const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
    res.status(200).send(tokenRequest)
}

export async function postUsername(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.name) {
        console.log(`Missing key in username POST body from ${clientId}: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid username POST data' })
        return
    }
    const update: ProfileData = { id: body.id, name: body.name }
    await saveProfileData(update)
    console.info(`Posted username for profile ${body.id} (${body.name}) from client ${clientId}`)
    res.status(204).send()
}

export async function postConversation(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.name || !body?.ownerId || typeof body?.ownerName !== 'string') {
        console.log(`Missing key in conversation POST body from ${clientId}: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid conversation POST data' })
        return
    }
    const info: ConversationInfo = { id: body.id, name: body.name, ownerId: body.ownerId }
    const existing = await getConversationInfo(info.id)
    if (existing && existing.ownerId != info.ownerId) {
        console.error(`Collision on owner profile ${info.id}: POST from client ${clientId} is rejected`)
        res.status(409).send({ status: 'error', reason: `Owner ID doesn't match existing` })
        return
    }
    await setConversationInfo(info)
    const update: ProfileData = { id: body.ownerId, name: body.ownerName }
    await saveProfileData(update)
    if (existing) {
        console.info(`Updated conversation ${info.id} (${info.name}) ` +
            `for user ${info.ownerId} (${body.ownerName}) posted from client ${clientId}`)
        res.status(204).send()
    } else {
        console.log(`New conversation ${info.id} (${info.name}) ` +
            `for user ${info.ownerId} (${body.ownerName}) posted from client ${clientId}`)
        res.status(201).send()
    }
}

export async function userProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body.id || !body.name || !body.password) {
        console.log(`User profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.password) {
        console.error(`User profile POST for ${body.id} from client ${clientId} but the profile is already shared`)
        res.status(409).send({ status: `error`, reason: `Profile ${body.id} is already shared` })
        return
    }
    const newData: ProfileData = {
        id: body.id,
        name: body.name,
        password: body.password,
    }
    await saveProfileData(newData)
    console.log(`Successful POST of user profile ${body.id} (${body.name}) from client ${clientId}`)
    res.status(201).send()
}

export async function userProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    const profileId = req.params?.profileId
    if (!profileId || !body?.name) {
        console.log(`User profile PUT from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid PUT data` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData.password) {
        console.error(`User profile PUT for ${profileId} from client ${clientId} but the profile is not shared`)
        res.status(404).send({ status: `error`, reason: `Profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    console.log(`Successful PUT of user profile ${profileId} (${body.name}) from client ${clientId}`)
    existingData.name = body.name
    await saveProfileData(existingData)
    res.status(204).send()
}

export async function userProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No user profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.name || !existingData?.password) {
        console.error(`User profile GET from client ${clientId} for profile ${profileId} but profile is not shared`)
        res.status(404).send({ status: `error`, reason: `Profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.name}"`) {
        console.log(`Precondition Failed on GET of user profile ${profileId} (${existingData.name}) from client ${clientId}`)
        res.status(412).send({ status: `error`, reason: `Server name matches client name` })
        return
    }
    console.log(`Successful GET of user profile ${profileId} (${existingData.name}) from client ${clientId}`)
    const body = { id: existingData.id, name: existingData.name }
    res.setHeader('ETag', `"${existingData.name}"`)
    res.status(200).send(body)
}

export async function whisperProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Whisper profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.whisperProfile) {
        console.error(`Whisper profile POST for already-shared ${body.id} (${existingData?.name}) from client ${clientId}`)
        res.status(409).send({ status: `error`, reason: `Whisper profile ${body.id} is already shared` })
        return
    }
    console.log(`Successful POST of whisper profile ${body.id} (${existingData?.name}) from client ${clientId}`)
    const newData: ProfileData = {
        id: body.id,
        whisperTimestamp: body.timestamp,
        whisperProfile: JSON.stringify(body),
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function whisperProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Whisper profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` })
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Whisper profile PUT from client ${clientId} is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.whisperTimestamp || !existingData?.whisperProfile) {
        console.error(`Whisper profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Whisper profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    if (existingData.whisperTimestamp > req.body.timestamp) {
        console.error(`Whisper profile PUT for older ${profileId} (${existingData?.name}) from ${clientId}`)
        res.status(409).send({ status: `error`, reason: `Newer whisper profile version on server` })
    }
    console.log(`Successful PUT of whisper profile ${existingData.id} (${existingData?.name}) from client ${clientId}`)
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
        console.log(`No whisper profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.whisperTimestamp || !existingData.whisperProfile) {
        console.error(`Whisper profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Whisper profile ${profileId} isn't shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.whisperTimestamp}"`) {
        console.log(`Precondition Failed on GET of whisper profile ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(412).send({ status: `error`, reason: `Server whisper timestamp matches client timestamp` })
        return
    }
    console.log(`Successful GET of whisper profile ${profileId} (${existingData?.name}) from client ${clientId}`)
    res.setHeader('ETag', `"${existingData.whisperTimestamp}"`)
    const body = JSON.parse(existingData.whisperProfile)
    res.status(200).send(body)
}

export async function listenProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Listen profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.listenProfile) {
        console.error(`Listen profile POST for already-shared ${body.id} (${existingData?.name}) from ${clientId}`)
        res.status(409).send({ status: `error`, reason: `Listen profile ${body.id} is already shared` })
        return
    }
    console.log(`Successful POST of listen profile ${body.id} (${existingData?.name}) from client ${clientId}`)
    const newData: ProfileData = {
        id: body.id,
        listenTimestamp: body.timestamp,
        listenProfile: JSON.stringify(body),
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function listenProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Listen profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` })
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Listen profile PUT from client ${clientId} is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.listenTimestamp || !existingData?.listenProfile) {
        console.error(`Listen profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Listen profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    if (existingData.listenTimestamp > req.body.timestamp) {
        console.error(`Listen profile PUT for older ${profileId} (${existingData?.name}) from ${clientId}`)
        res.status(409).send({ status: `error`, reason: `Newer listen profile version on server` })
    }
    console.log(`Successful PUT of listen profile ${profileId} (${existingData?.name}) from client ${clientId}`)
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
        console.log(`No listen profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.listenTimestamp || !existingData.listenProfile) {
        console.error(`Listen profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Listen profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.listenTimestamp}"`) {
        console.log(`Precondition Failed on GET of listen profile ${profileId} (${existingData.name}) from client ${clientId}`)
        res.status(412).send({ status: `error`, reason: `Server listen timestamp matches client timestamp` })
        return
    }
    console.log(`Successful GET of listen profile ${profileId} (${existingData?.name}) from client ${clientId}`)
    res.setHeader('ETag', `"${existingData.listenTimestamp}"`)
    const body = JSON.parse(existingData.listenProfile)
    res.status(200).send(body)
}

export async function settingsProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.eTag || !body?.settings) {
        console.log(`Settings profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.settingsProfile) {
        console.error(`Settings profile POST for already-shared ${body.id} (${existingData?.name}) from ${clientId}`)
        res.status(409).send({ status: `error`, reason: `Settings profile ${body.id} is already shared` })
        return
    }
    console.log(`Successful POST of settings profile ${body.id} (${existingData?.name}) from client ${clientId}`)
    const newData: ProfileData = {
        id: body.id,
        settingsETag: body.eTag,
        settingsProfile: body.settings,
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function settingsProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Settings profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` })
        return
    }
    if (!req.body || !req.body['eTag'] || !req.body['settings']) {
        console.error(`Settings profile PUT from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid PUT data` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.settingsETag || !existingData?.settingsProfile) {
        console.error(`Settings profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Settings profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    console.log(`Successful PUT of settings profile ${profileId} (${existingData?.name}) from client ${clientId}`)
    const newData: ProfileData = {
        id: existingData.id,
        settingsETag: req.body['eTag'],
        settingsProfile: req.body['settings'],
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function settingsProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No settings profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.settingsETag || !existingData.settingsProfile) {
        console.error(`Settings profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `Settings profile ${profileId} is not shared` })
        return
    }
    if (!await validateProfileAuth(req, res, existingData.password)) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.settingsETag}"`) {
        console.log(`Precondition Failed on GET of settings profile ${profileId} (${existingData.name}) from client ${clientId}`)
        res.status(412).send({ status: `error`, reason: `Server settings eTag matches client eTag` })
        return
    }
    console.log(`Successful GET of settings profile ${profileId} (${existingData?.name}) from client ${clientId}`)
    res.setHeader('ETag', `"${existingData.settingsETag}"`)
    const body = JSON.parse(existingData.settingsProfile)
    res.status(200).send(body)
}
