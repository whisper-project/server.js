// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useState} from 'react'
import {configureAbly, useChannel, usePresence} from '@ably-labs/react-hooks'
import {Types as Ably} from 'ably'

const urlParams = new URLSearchParams(window.location.search)
const publisherId = urlParams.get('publisherId') || ''
const publisherName = urlParams.get('publisherName') || ''
const clientId = urlParams.get('clientId') || ''
const clientName = urlParams.get('clientName') || ''
if (!publisherId || !publisherName || !clientId || !clientName) {
    window.location.href = "/subscribe404.html"
}

configureAbly({authUrl: '/api/subscribeTokenRequest'})
const channelName = `${publisherId}:whisper`
let resetInProgress: boolean = false

export default function ListenView() {
    const [whisperer, updateWhisperer] = useState(`Connecting to ${publisherName}...`)
    const [client, updateClient] = useState(clientName)
    const [liveText, updateLiveText] = useState('This is where live text will appear')
    const [pastText, updatePastText] = useState('This is where past text will appear')
    const [channel] = useChannel(
        channelName,
        (message) => receiveChunk(
            message, channel, updateWhisperer, liveText, updateLiveText, pastText, updatePastText))
    const [_presence, updatePresence] = usePresence(
        channelName,
        client,
        (message) => receivePresence(
            message as Ably.PresenceMessage, channel, updateLiveText, updatePastText, updateWhisperer))

    function updateClientEverywhere(name: string) {
        updateClient(name)
        updatePresence(name)
    }

    return (
        <>
            <PublisherName whisperer={whisperer}/>
            <form>
                <ClientName client={client} updateClient={updateClientEverywhere}/>
                <LiveText liveText={liveText}/>
                <PastText pastText={pastText}/>
            </form>
        </>
    )
}

function PublisherName(props: { whisperer: string }) {
    return <h1>{props.whisperer}</h1>
}

function ClientName(props: { client: string, updateClient: (s: string) => void }) {
    function handleSubmit() {
        const input = document.getElementById('listenerName')
        if (input && input.textContent) {
            props.updateClient(input.textContent)}
    }

    return (
        <>
            <input
                id="listenerName"
                type="text"
                value={props.client}
            />
            <button
                id="submitButton"
                type="submit"
                onSubmit={handleSubmit}
            >
                Update
            </button>
        </>
    )
}

function LiveText(props: { liveText: string }) {
    return (
        <textarea
            id="liveText"
            rows={25}
            readOnly={true}>
            {props.liveText}
        </textarea>
    )
}

function PastText(props: { pastText: string }) {
    return (
        <textarea
            id="pastText"
            rows={25}
            readOnly={true}>
            {props.pastText}
        </textarea>
    )
}

function receiveChunk(message: Ably.Message,
                      channel: Ably.RealtimeChannelCallbacks,
                      updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                      liveText: string,
                      updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                      pastText: string,
                      updatePastText: React.Dispatch<React.SetStateAction<string>>) {
    console.log(`Received chunk from ${message.clientId}, topic ${message.name}: ${message.data}`)
    if (message.name.toUpperCase() === clientId.toUpperCase()) {
        const [offset, text] = (message.data as string).split("|", 1)
        if (offset === "-21" && text.toUpperCase() === clientId.toUpperCase()) {
            console.log(`Whisperer is disconnecting.`)
            channel.detach()
            updateWhisperer(`Disconnected from ${publisherName}`)
            return
        } else {
            console.log('Ignoring unexpected chunk:', message.data)
        }
    } else if (message.name === 'all') {
        processChunk(message.data as string, liveText, updateLiveText, pastText, updatePastText)
    } else {
        console.log(`Ignoring chunk meant for other listener: ${message.name}`)
    }
}

function receivePresence(message: Ably.PresenceMessage,
                         channel: Ably.RealtimeChannelCallbacks,
                         updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                         updatePastText: React.Dispatch<React.SetStateAction<string>>,
                         updateWhisperer: React.Dispatch<React.SetStateAction<string>>) {
    console.log(`Received presence message: ${message.clientId}, ${message.data}, ${message.action}`)
    if (message.clientId.toUpperCase() === publisherId.toUpperCase()) {
        console.log(`Received presence from Whisperer: ${message.data}, ${message.action}`)
        updateWhisperer(`Connected to ${message.data}`)
        // auto-subscribe
        readAllText(channel, updateLiveText, updatePastText)
    }
}

function readAllText(channel: Ably.RealtimeChannelCallbacks,
                     updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                     updatePastText: React.Dispatch<React.SetStateAction<string>>) {
    if (resetInProgress) {
        // already reading all the text
        return
    }
    resetInProgress = true
    // reset the current text
    updatePastText('')
    updateLiveText('')
    // request the whisperer to send all the text
    channel.publish(publisherId, "-20|all")
}

function processChunk(chunk: string,
                      liveText: string,
                      updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                      pastText: string,
                      updatePastText: React.Dispatch<React.SetStateAction<string>>) {
    function isDiff(chunk: string): boolean {
        return chunk.startsWith('-1') || !chunk.startsWith('-')
    }
    if (chunk.startsWith('-9|')) {
        console.log("Received request to play sound")
    } else if (resetInProgress) {
        if (chunk.startsWith('-4|')) {
            console.log("Received reset acknowledgement from whisperer, clearing past text")
            updatePastText('')
        } else if (isDiff(chunk)) {
            console.log("Ignoring diff chunk because a read is in progress")
        } else if (chunk.startsWith('-1|') || chunk.startsWith('-2|')) {
            console.log("Prepending past line chunk")
            updatePastText(chunk.substring(3) + '\n' + pastText)
        } else if (chunk.startsWith('-3|')) {
            console.log("Receive live text chunk, update is over")
            updateLiveText(chunk.substring(3))
            resetInProgress = false
        }
    } else {
        if (!isDiff(chunk)) {
            console.log("Ignoring non-diff chunk because no read in progress")
        } else if (chunk.startsWith('0|')) {
            updateLiveText(chunk.substring(3))
        } else if (chunk.startsWith('-1|')) {
            console.log("Prepending live text to past line")
            updatePastText(liveText + '\n' + pastText)
            updateLiveText('')
        } else {
            const [offsetDigits, text] = chunk.split('|', 1)
            const offset = parseInt(offsetDigits)
            updateLiveText(liveText.substring(0, offset) + text)
        }
    }
}
