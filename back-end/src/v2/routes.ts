// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import express from 'express'
import { randomUUID } from 'crypto'

import { createAblyPublishTokenRequest, createAblySubscribeTokenRequest } from './auth.js'
import { subscribe_response } from './templates.js'
import { validateClientJwt } from '../auth.js'
import { ConversationInfo, getConversationInfo, setConversationInfo } from '../conversation.js'
import { getProfileData, ProfileData, saveProfileData } from '../client.js'

export async function pubSubTokenRequest(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.clientId || !body?.activity || !body?.conversationId || !body?.conversationName ||
        !body?.contentId || !body.profileId || !body.username) {
        console.log(`Missing key in pub-sub token request body: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid POST data' });
        return
    }
    const { clientId, activity, conversationId, contentId } = body
    const clientKey = `cli:${clientId}`
    console.log(`Token v2 request received from client ${clientKey}`)
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (!await validateClientJwt(auth.substring(7), clientKey)) {
        console.log(`Client JWT failed to validate`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization' })
        return
    }
    if (activity !== 'publish' && activity !== 'subscribe') {
        console.log(`Publishing and subscribing are the only allowed activities: ${JSON.stringify(body)}`)
        res.status(400).send({ status: 'error', reason: 'Invalid activity' });
        return
    }
    if (activity === 'publish') {
        // save the conversation info for Web listeners:
        const conversationKey = `con:${body.conversationId}`
        const info: ConversationInfo = {
            id: conversationId, name: body.conversationName, ownerId: body.profileId, ownerName: body.username
        }
        console.log(`Saving conversation data for listeners: ${JSON.stringify(info)}`)
        await setConversationInfo(conversationKey, info)
        // now issue the token
        const tokenRequest = await createAblyPublishTokenRequest(clientId, conversationId, contentId)
        console.log(`Issued publish token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
    } else {
        const tokenRequest = await createAblySubscribeTokenRequest(clientId, conversationId)
        console.log(`Issued subscribe token request to client ${clientKey}`)
        res.status(200).send({ status: 'success', tokenRequest: JSON.stringify(tokenRequest)})
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
    console.log(`Received listen link for conversation id ${conversationId}`)
    const conversationKey = `con:${conversationId}`
    const info = await getConversationInfo(conversationKey)
    console.log(`Fetched conversation info for listener: ${JSON.stringify(info)}`)
    if (!info) {
        res.setHeader('Location', '/subscribe404.html')
        res.status(303).send()
        return
    }
    let clientId = req?.session?.clientId
    if (!clientId) {
        clientId = randomUUID().toUpperCase()
    }
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
    const body: { [p: string]: string } = req.body
    if (!body.id || !body.name || !body.password) {
        console.log(`User profile POST is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.name) {
        console.error(`User profile POST for ${body.id} but the profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        name: body.name,
        password: body.password
    }
    await saveProfileData(newData)
    console.log(`Successful POST of user profile ${body.id}`)
    res.status(201).send()
}

export async function userProfilePut(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    const profileId = req.params?.profileId
    if (!profileId || !body?.name) {
        console.log(`User profile PUT is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid PUT data` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.name) {
        console.error(`User profile PUT for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`User profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    existingData.name = body.name
    await saveProfileData(existingData)
    console.log(`Successful PUT of user profile ${existingData.id}`)
    res.status(204).send()
}

export async function userProfileGet(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.name || !existingData?.password) {
        console.error(`User profile GET for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`User profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.name}"`) {
        console.log(`User profile name matches client-submitted name, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server name matches client name`})
        return
    }
    console.log(`Successful GET of user profile ${existingData.id}`)
    const body = { id: existingData.id, name: existingData.name }
    res.setHeader("ETag", `"${existingData.name}"`)
    res.status(200).send(body)
}

export async function whisperProfilePost(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Whisper profile POST is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.whisperProfile) {
        console.error(`Whisper profile POST for ${body.id} but the whisper profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        whisperTimestamp: body.timestamp,
        whisperProfile: JSON.stringify(body)
    }
    await saveProfileData(newData)
    console.log(`Successful POST of whisper profile ${body.id}`)
    res.status(201).send()
}

export async function whisperProfilePut(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Whisper profile PUT is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` });
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Whisper profile PUT is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp`})
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.whisperTimestamp || !existingData?.whisperProfile) {
        console.error(`Whisper profile PUT for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`Whisper profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    if (existingData.whisperTimestamp > req.body.timestamp) {
        console.error(`Post of whisper profile has older timestamp`)
        res.status(409).send({status: `error`, reason: `Newer version on server`})
    }
    console.log(`Successful PUT of whisper profile ${existingData.id}`)
    const newData: ProfileData = {
        id: existingData.id,
        whisperTimestamp: req.body.timestamp,
        whisperProfile: JSON.stringify(req.body),
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function whisperProfileGet(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.whisperTimestamp || !existingData.whisperProfile) {
        console.error(`Whisper profile get for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`User profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.whisperTimestamp}"`) {
        console.log(`Whisper profile timestamp matches client-submitted timestamp, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server timestamp matches client timestamp`})
        return
    }
    console.log(`Successful GET of whisper profile ${existingData.id}`)
    res.setHeader("ETag", `"${existingData.whisperTimestamp}"`)
    const body = JSON.parse(existingData.whisperProfile)
    res.status(200).send(body)
}

export async function listenProfilePost(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Listen profile POST is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.listenProfile) {
        console.error(`Listen profile POST for ${body.id} but the listen profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        listenTimestamp: body.timestamp,
        listenProfile: JSON.stringify(body)
    }
    await saveProfileData(newData)
    console.log(`Successful POST of listen profile ${body.id}`)
    res.status(201).send()
}

export async function listenProfilePut(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Listen profile PUT is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` });
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Listen profile PUT is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp`})
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.listenTimestamp || !existingData?.listenProfile) {
        console.error(`Listen profile PUT for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`Listen profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    if (existingData.listenTimestamp > req.body.timestamp) {
        console.error(`Post of listen profile has older timestamp`)
        res.status(409).send({status: `error`, reason: `Newer version on server`})
    }
    console.log(`Successful PUT of listen profile ${existingData.id}`)
    const newData: ProfileData = {
        id: existingData.id,
        listenTimestamp: req.body.timestamp,
        listenProfile: JSON.stringify(req.body),
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function listenProfileGet(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No profile ID specified in GET`)
        res.status(404).send({ status: `error`, reason: `No such profile` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData?.password || !existingData.listenTimestamp || !existingData.listenProfile) {
        console.error(`Listen profile get for ${profileId} but the profile does not exist`)
        res.status(404).send({status: `error`, reason: `Profile ${profileId} doesn't exist`})
        return
    }
    const auth = req.header('Authorization')
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        console.log(`Missing or invalid authorization header: ${auth}`)
        res.status(403).send({ status: 'error', reason: 'Invalid authorization header' })
        return
    }
    if (auth.substring(7) != existingData.password) {
        console.error(`User profile PUT has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    const precondition = req.header("If-None-Match")
    if (precondition && precondition === `"${existingData.listenTimestamp}"`) {
        console.log(`Listen profile timestamp matches client-submitted timestamp, returning Precondition Failed`)
        res.status(412).send({status: `error`, reason: `Server timestamp matches client timestamp`})
        return
    }
    console.log(`Successful GET of listen profile ${existingData.id}`)
    res.setHeader("ETag", `"${existingData.listenTimestamp}"`)
    const body = JSON.parse(existingData.listenProfile)
    res.status(200).send(body)
}
