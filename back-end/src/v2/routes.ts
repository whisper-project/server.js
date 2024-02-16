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
        res.status(400).send({ status: 'error', reason: 'Invalid post data' });
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
        console.log(`User profile post is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid post data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData) {
        console.error(`User profile post for ${body.id} but the profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        name: body.name,
        password: body.password
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function userProfilePut(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    const profileId = req.params?.profileId
    if (!profileId || !body?.name) {
        console.log(`User profile put is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid put data` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData) {
        console.error(`User profile put for ${profileId} but the profile does not exist`)
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
        console.error(`User profile put has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    existingData.name = body.name
    await saveProfileData(existingData)
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
    if (!existingData || !existingData?.password) {
        console.error(`User profile get for ${profileId} but the profile does not exist`)
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
        console.error(`User profile put has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    const body = { id: existingData.id, name: existingData.name }
    res.status(200).send(body)
}

export async function whisperProfilePost(req: express.Request, res: express.Response) {
    const body: { [p: string]: string } = req.body
    if (!body.id) {
        console.log(`Whisper profile post is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid post data` });
        return
    }
    const existingData = await getProfileData(body.id)
    if (!existingData || !existingData.password) {
        console.warn(`Whisper profile post for ${body.id} precedes user profile post`)
    }
    if (existingData && existingData?.whisperProfile) {
        console.error(`Whisper profile post for ${body.id} but the whisper profile exists`)
        res.status(409).send({status: `error`, reason: `Profile ${body.id} already exists`})
        return
    }
    const newData: ProfileData = {
        id: body.id,
        whisperProfile: JSON.stringify(body)
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function whisperProfilePut(req: express.Request, res: express.Response) {
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Whisper profile put is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` });
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData || !existingData.password || !existingData?.whisperProfile) {
        console.error(`Whisper profile put for ${profileId} but the profile does not exist`)
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
        console.error(`Whisper profile put has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    existingData.whisperProfile = JSON.stringify(req.body)
    await saveProfileData(existingData)
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
    if (!existingData || !existingData?.password || !existingData.whisperProfile) {
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
        console.error(`User profile put has incorrect password`)
        res.status(403).send({status: `error`, reason: `Invalid authorization` })
        return
    }
    const body = JSON.parse(existingData.whisperProfile)
    res.status(200).send(body)
}
