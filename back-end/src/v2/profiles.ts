// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// All the copyrighted work in this repository is licensed under the
// GNU Affero General Public License v3, reproduced in the LICENSE file.

import express from 'express'
import { getProfileData, ProfileData, saveProfileData } from '../profile.js'
import { validateProfileAuth } from '../auth.js'

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
        console.error(
            `User profile POST for ${body.id} from client ${clientId} but the profile is already shared`,
        )
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
        console.error(
            `User profile PUT for ${profileId} from client ${clientId} but the profile is not shared`,
        )
        res.status(404).send({ status: `error`, reason: `Profile ${profileId} is not shared` })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    console.log(
        `Successful PUT of user profile ${profileId} (${body.name}) from client ${clientId}`,
    )
    const update: ProfileData = { id: profileId, name: body.username }
    await saveProfileData(update)
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
        console.error(
            `User profile GET from client ${clientId} for profile ${profileId} but profile is not shared`,
        )
        res.status(404).send({ status: `error`, reason: `Profile ${profileId} is not shared` })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.name}"`) {
        console.log(
            `Precondition Failed on GET of user profile ${profileId} (${existingData.name}) from client ${clientId}`,
        )
        res.status(412).send({ status: `error`, reason: `Server name matches client name` })
        return
    }
    console.log(
        `Successful GET of user profile ${profileId} (${existingData.name}) from client ${clientId}`,
    )
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
        console.error(
            `Whisper profile POST for already-shared ${body.id} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Whisper profile ${body.id} is already shared`,
        })
        return
    }
    console.log(
        `Successful POST of whisper profile ${body.id} (${existingData?.name}, ${body.timestamp}) from client ${clientId}`,
    )
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
    if (
        !existingData?.password ||
        !existingData?.whisperTimestamp ||
        !existingData?.whisperProfile
    ) {
        console.error(
            `Whisper profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Whisper profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    if (existingData.whisperTimestamp > req.body.timestamp) {
        console.error(
            `Whisper profile PUT for older ${profileId} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({ status: `error`, reason: `Newer whisper profile version on server` })
    }
    console.log(
        `Successful PUT of whisper profile ${existingData.id} (${existingData?.name}, ${req.body.timestamp}) from client ${clientId}`,
    )
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
    if (
        !existingData ||
        !existingData?.password ||
        !existingData.whisperTimestamp ||
        !existingData.whisperProfile
    ) {
        console.error(
            `Whisper profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Whisper profile ${profileId} isn't shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.whisperTimestamp}"`) {
        console.log(
            `Precondition Failed on GET of whisper profile ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(412).send({
            status: `error`,
            reason: `Server whisper timestamp matches client timestamp`,
        })
        return
    }
    console.log(
        `Successful GET of whisper profile ${profileId} (${existingData?.name}, ${existingData.whisperTimestamp}) from client ${clientId}`,
    )
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
        console.error(
            `Listen profile POST for already-shared ${body.id} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Listen profile ${body.id} is already shared`,
        })
        return
    }
    console.log(
        `Successful POST of listen profile ${body.id} (${existingData?.name}, ${body.timestamp}) from client ${clientId}`,
    )
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
        console.error(
            `Listen profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Listen profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    if (existingData.listenTimestamp > req.body.timestamp) {
        console.error(
            `Listen profile PUT for older ${profileId} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({ status: `error`, reason: `Newer listen profile version on server` })
    }
    console.log(
        `Successful PUT of listen profile ${profileId} (${existingData?.name}, ${req.body.timestamp}) from client ${clientId}`,
    )
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
    if (
        !existingData ||
        !existingData?.password ||
        !existingData.listenTimestamp ||
        !existingData.listenProfile
    ) {
        console.error(
            `Listen profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Listen profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.listenTimestamp}"`) {
        console.log(
            `Precondition Failed on GET of listen profile ${profileId} (${existingData.name}) from client ${clientId}`,
        )
        res.status(412).send({
            status: `error`,
            reason: `Server listen timestamp matches client timestamp`,
        })
        return
    }
    console.log(
        `Successful GET of listen profile ${profileId} (${existingData?.name}, ${existingData.listenTimestamp}) from client ${clientId}`,
    )
    res.setHeader('ETag', `"${existingData.listenTimestamp}"`)
    const body = JSON.parse(existingData.listenProfile)
    res.status(200).send(body)
}

export async function settingsProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string | number } = req.body
    if (!body?.id || !body?.eTag) {
        console.log(`Settings profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id as string)
    if (existingData?.settingsProfile) {
        console.error(
            `Settings profile POST for already-shared ${body.id} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Settings profile ${body.id} is already shared`,
        })
        return
    }
    const settingsVersion = (body?.version as number) || 1
    const settingsETag = body.eTag as string
    console.log(
        `Successful POST of settings profile ${body.id} (${existingData?.name}, ` +
            `v${settingsVersion}, ${settingsETag}) from client ${clientId}`,
    )
    const newData: ProfileData = {
        id: body.id as string,
        settingsVersion,
        settingsETag,
        settingsProfile: JSON.stringify(body),
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
    const body: { [p: string]: string | number } = req.body
    if (!body || !body?.eTag) {
        console.error(`Settings profile PUT from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid PUT data` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (!existingData?.password || !existingData?.settingsETag || !existingData?.settingsProfile) {
        console.error(
            `Settings profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Settings profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const existingVersion = existingData?.settingsVersion || 1
    const putVersion = (body?.version as number) || 1
    if (putVersion < existingVersion) {
        console.error(
            `Failed PUT of setting profile v${putVersion} ` +
                `for ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Settings profile is already at version ${existingVersion}`,
        })
        return
    }
    console.log(
        `Successful PUT of settings profile v${putVersion}, ${body.eTag} ` +
            `for ${profileId} (${existingData?.name}) from client ${clientId}`,
    )
    const newData: ProfileData = {
        id: existingData.id,
        settingsVersion: putVersion,
        settingsETag: body.eTag as string,
        settingsProfile: JSON.stringify(body),
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
    if (
        !existingData ||
        !existingData?.password ||
        !existingData.settingsETag ||
        !existingData.settingsProfile
    ) {
        console.error(
            `Settings profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Settings profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.settingsETag}"`) {
        console.log(
            `Precondition Failed on GET of settings profile ${profileId} (${existingData.name}) from client ${clientId}`,
        )
        res.status(412).send({
            status: `error`,
            reason: `Server settings eTag matches client eTag`,
        })
        return
    }
    console.log(
        `Successful GET of settings profile ${profileId} (${existingData?.name}, ${existingData.settingsETag}) from client ${clientId}`,
    )
    res.setHeader('ETag', `"${existingData.settingsETag}"`)
    const body = JSON.parse(existingData.settingsProfile)
    if (!body?.version) {
        body.version = 1
    }
    res.status(200).send(body)
}

export async function favoritesProfilePost(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const body: { [p: string]: string } = req.body
    if (!body?.id || !body?.timestamp) {
        console.log(`Favorites profile POST from client ${clientId} is missing data`)
        res.status(400).send({ status: `error`, reason: `Invalid POST data` })
        return
    }
    const existingData = await getProfileData(body.id)
    if (existingData?.favoritesProfile) {
        console.error(
            `Favorites profile POST for already-shared ${body.id} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Favorites profile ${body.id} is already shared`,
        })
        return
    }
    console.log(
        `Successful POST of favorites profile ${body.id} (${existingData?.name}, ${body.timestamp}) from client ${clientId}`,
    )
    const newData: ProfileData = {
        id: body.id,
        favoritesTimestamp: body.timestamp,
        favoritesProfile: JSON.stringify(body),
    }
    await saveProfileData(newData)
    res.status(201).send()
}

export async function favoritesProfilePut(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`Favorites profile PUT from client ${clientId} is missing profile ID`)
        res.status(404).send({ status: `error`, reason: `Invalid Profile ID` })
        return
    }
    if (!req.body || !req.body?.timestamp) {
        console.error(`Favorites profile PUT from client ${clientId} is missing a timestamp`)
        res.status(400).send({ status: `error`, reason: `Missing timestamp` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (
        !existingData?.password ||
        !existingData?.favoritesTimestamp ||
        !existingData?.favoritesProfile
    ) {
        console.error(
            `Favorites profile PUT for not-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Favorites profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    if (existingData.favoritesTimestamp > req.body.timestamp) {
        console.error(
            `Favorites profile PUT for older ${profileId} (${existingData?.name}) from ${clientId}`,
        )
        res.status(409).send({
            status: `error`,
            reason: `Newer favorites profile version on server`,
        })
    }
    console.log(
        `Successful PUT of favorites profile ${profileId} (${existingData?.name}, ${req.body.timestamp}) from client ${clientId}`,
    )
    const newData: ProfileData = {
        id: existingData.id,
        favoritesTimestamp: req.body.timestamp,
        favoritesProfile: JSON.stringify(req.body),
    }
    await saveProfileData(newData)
    res.status(204).send()
}

export async function favoritesProfileGet(req: express.Request, res: express.Response) {
    const clientId = req.header('X-Client-Id') || 'unknown-client'
    const profileId = req.params?.profileId
    if (!profileId) {
        console.log(`No favorites profile ID specified in GET from client ${clientId}`)
        res.status(404).send({ status: `error`, reason: `No such profile` })
        return
    }
    const existingData = await getProfileData(profileId)
    if (
        !existingData ||
        !existingData?.password ||
        !existingData.favoritesTimestamp ||
        !existingData.favoritesProfile
    ) {
        console.error(
            `Favorites profile get for non-shared ${profileId} (${existingData?.name}) from client ${clientId}`,
        )
        res.status(404).send({
            status: `error`,
            reason: `Favorites profile ${profileId} is not shared`,
        })
        return
    }
    if (!(await validateProfileAuth(req, res, existingData.password))) return
    const precondition = req.header('If-None-Match')
    if (precondition && precondition === `"${existingData.favoritesTimestamp}"`) {
        console.log(
            `Precondition Failed on GET of favorites profile ${profileId} (${existingData.name}) from client ${clientId}`,
        )
        res.status(412).send({
            status: `error`,
            reason: `Server favorites timestamp matches client timestamp`,
        })
        return
    }
    console.log(
        `Successful GET of favorites profile ${profileId} (${existingData?.name}, ${existingData.favoritesTimestamp}) from client ${clientId}`,
    )
    res.setHeader('ETag', `"${existingData.favoritesTimestamp}"`)
    const body = JSON.parse(existingData.favoritesProfile)
    res.status(200).send(body)
}
