// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useState} from 'react'
import {configureAbly, useChannel, usePresence} from '@ably-labs/react-hooks'
import {Types as Ably} from 'ably'

const urlParams = new URLSearchParams(window.location.search)
const publisherId = urlParams.get('publisherId') || ''
let publisherName = urlParams.get('publisherName') || ''
const clientId = urlParams.get('clientId') || ''
let clientName = urlParams.get('clientName') || ''
if (!publisherId || !publisherName || !clientId || !clientName) {
    window.location.href = "/subscribe404.html"
}

configureAbly({
    clientId: clientId,
    authUrl: '/api/subscribeTokenRequest',
    echoMessages: false,
})
const channelName = `${publisherId}:whisper`
let resetInProgress: boolean = false
let presenceMessagesProcessed = 0
const disconnectedLiveText = 'This is where live text will appear'
const disconnectedPastText = 'This is where past text will appear'

export default function ListenView() {
    const [whisperer, updateWhisperer] = useState(`Connecting to ${publisherName}...`)
    const [client, updateClient] = useState(clientName)
    const [liveText, updateLiveText] = useState(disconnectedLiveText)
    function getLiveText() { return liveText }
    const [pastText, updatePastText] = useState(disconnectedPastText)
    function getPastText() { return pastText }
    const [channel] = useChannel(
        channelName,
        (message) => receiveChunk(
            message, channel, updateWhisperer, getLiveText, updateLiveText, getPastText, updatePastText))
    const [presence, updatePresence] = usePresence(channelName, client)
    if (presence.length > presenceMessagesProcessed) {
        console.log(`Processing ${presence.length - presenceMessagesProcessed} presence messages`)
        for (; presenceMessagesProcessed < presence.length; presenceMessagesProcessed++) {
            receivePresence(
                presence[presenceMessagesProcessed] as Ably.PresenceMessage,
                channel, updateLiveText, updatePastText, updateWhisperer)
        }
    }

    return (
        <>
            <PublisherName whisperer={whisperer}/>
            <form>
                <ClientName client={client} updateClient={updateClient} updatePresence={updatePresence} />
                <LiveText liveText={liveText}/>
                <PastText pastText={pastText}/>
            </form>
        </>
    )
}

function PublisherName(props: { whisperer: string }) {
    return <h1>{props.whisperer}</h1>
}

function ClientName(props: {
    client: string,
    updateClient: React.Dispatch<React.SetStateAction<string>>,
    updatePresence: (p: string) => void,
}) {
    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        clientName = e.target.value
        props.updateClient(clientName)
    }
    function onUpdate() {
        props.updatePresence(clientName)
    }

    return (
        <>
            <input
                id="listenerName"
                type="text"
                value={props.client}
                onChange={onChange}
            />
            <button
                id="updateButton"
                type="button"
                onClick={onUpdate}
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
            value={props.liveText}
        />
    )
}

function PastText(props: { pastText: string }) {
    return (
        <textarea
            id="pastText"
            rows={25}
            readOnly={true}
            value={props.pastText}
        />
    )
}

function receiveChunk(message: Ably.Message,
                      channel: Ably.RealtimeChannelCallbacks,
                      updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                      getLiveText: () => string,
                      updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                      getPastText: () => string,
                      updatePastText: React.Dispatch<React.SetStateAction<string>>) {
    if (message.name.toUpperCase() === clientId.toUpperCase()) {
        console.log(`Received chunk directed here: ${message.data}`)
        const [offset, text] = (message.data as string).split("|", 1)
        if (offset === "-21" && text.toUpperCase() === clientId.toUpperCase()) {
            console.log(`Whisperer is dropping this client`)
            channel.detach()
            updateWhisperer(`Dropped by ${publisherName}`)
            updateLiveText(disconnectedLiveText)
            updatePastText(disconnectedPastText)
        } else {
            processChunk(message.data as string, getLiveText, updateLiveText, getPastText, updatePastText)
        }
    } else if (message.name === 'all') {
        processChunk(message.data as string, getLiveText, updateLiveText, getPastText, updatePastText)
    } else {
        if (message.clientId.toUpperCase() != publisherId.toUpperCase()) {
            console.log(`Ignoring chunk from non-listener ${message.clientId}, topic ${message.name}: ${message.data}`)
        } else {
            console.log(`Ignoring chunk with topic ${message.name}: ${message.data}`)
        }
    }
}

function receivePresence(message: Ably.PresenceMessage,
                         channel: Ably.RealtimeChannelCallbacks,
                         updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                         updatePastText: React.Dispatch<React.SetStateAction<string>>,
                         updateWhisperer: React.Dispatch<React.SetStateAction<string>>) {
    if (message.clientId.toUpperCase() == clientId.toUpperCase()) {
        console.log(`Ignoring self presence message: ${message.action}, ${message.data}`)
    } else if (message.clientId.toUpperCase() === publisherId.toUpperCase()) {
        console.log(`Received presence from Whisperer: ${message.action}, ${message.data}`)
        if (['present', 'enter', 'update'].includes(message.action)) {
            publisherName = message.data
            updateWhisperer(`Connected to ${publisherName}`)
            // auto-subscribe
            readAllText(channel, updateLiveText, updatePastText)
        } else if (['leave', 'absent'].includes(message.action)) {
            publisherName = message.data
            updateWhisperer(`Disconnected from ${publisherName}`)
            updateLiveText(disconnectedLiveText)
            updatePastText(disconnectedPastText)
        }
    } else {
        console.log(`Ignoring presence message: ${message.clientId}, ${message.data}, ${message.action}`)
    }
}

function readAllText(channel: Ably.RealtimeChannelCallbacks,
                     updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                     updatePastText: React.Dispatch<React.SetStateAction<string>>) {
    if (resetInProgress) {
        // already reading all the text
        return
    }
    console.log("Requesting resend of all text...")
    resetInProgress = true
    // reset the current text
    updatePastText('')
    updateLiveText('')
    // request the whisperer to send all the text
    channel.publish(publisherId, "-20|all")
}

function processChunk(chunk: string,
                      getLiveText: () => string,
                      updateLiveText: React.Dispatch<React.SetStateAction<string>>,
                      getPastText: () => string,
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
            updatePastText(chunk.substring(3) + '\n' + getPastText())
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
            updatePastText(getLiveText() + '\n' + getPastText())
            updateLiveText('')
        } else {
            const [offsetDigits, text] = chunk.split('|', 1)
            const offset = parseInt(offsetDigits)
            updateLiveText(getLiveText().substring(0, offset) + text)
        }
    }
}
