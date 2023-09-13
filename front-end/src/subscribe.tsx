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
interface Text {
    live: string,
    past: string,
}
const disconnectedText: Text = {
    live: 'This is where live text will appear',
    past: 'This is where past text will appear',
}

export default function ListenView() {
    const [whisperer, updateWhisperer] = useState(`Connecting to ${publisherName}...`)
    const [client, updateClient] = useState(clientName)
    const [text, updateText] = useState(disconnectedText)
    const [channel] = useChannel(
        channelName,
        (message) => receiveChunk(message, channel, updateWhisperer, updateText))
    const [presence, updatePresence] = usePresence(channelName, client)
    if (presence.length > presenceMessagesProcessed) {
        console.log(`Processing ${presence.length - presenceMessagesProcessed} presence messages`)
        for (; presenceMessagesProcessed < presence.length; presenceMessagesProcessed++) {
            receivePresence(
                presence[presenceMessagesProcessed] as Ably.PresenceMessage,
                channel, updateWhisperer, updateText)
        }
    }

    return (
        <>
            <PublisherName whisperer={whisperer}/>
            <form>
                <ClientName client={client} updateClient={updateClient} updatePresence={updatePresence} />
                <LivePastText text={text}/>
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

function LivePastText(props: { text: Text }) {
    return (
        <>
            <textarea
                id="liveText"
                rows={10}
                value={props.text.live}
            />
            <textarea
                id="pastText"
                rows={30}
                readOnly={true}
                value={props.text.past}
            />
        </>
    )
}

function receiveChunk(message: Ably.Message,
                      channel: Ably.RealtimeChannelCallbacks,
                      updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                      updateText: React.Dispatch<React.SetStateAction<Text>>) {
    if (message.name.toUpperCase() === clientId.toUpperCase()) {
        console.log(`Received chunk directed here: ${message.data}`)
        const [offset, text] = (message.data as string).split("|", 1)
        if (offset === "-21" && text.toUpperCase() === clientId.toUpperCase()) {
            console.log(`Whisperer is dropping this client`)
            channel.detach()
            updateWhisperer(`Dropped by ${publisherName}`)
            updateText(disconnectedText)
        } else {
            processChunk(message.data as string, updateText)
        }
    } else if (message.name === 'all') {
        processChunk(message.data as string, updateText)
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
                         updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                         updateText: React.Dispatch<React.SetStateAction<Text>>) {
    if (message.clientId.toUpperCase() == clientId.toUpperCase()) {
        console.log(`Ignoring self presence message: ${message.action}, ${message.data}`)
    } else if (message.clientId.toUpperCase() === publisherId.toUpperCase()) {
        console.log(`Received presence from Whisperer: ${message.action}, ${message.data}`)
        if (['present', 'enter', 'update'].includes(message.action)) {
            publisherName = message.data
            updateWhisperer(`Connected to ${publisherName}`)
            // auto-subscribe
            readAllText(channel, updateText)
        } else if (['leave', 'absent'].includes(message.action)) {
            publisherName = message.data
            updateWhisperer(`Disconnected from ${publisherName}`)
            updateText(disconnectedText)
        }
    } else {
        console.log(`Ignoring presence message: ${message.clientId}, ${message.data}, ${message.action}`)
    }
}

function readAllText(channel: Ably.RealtimeChannelCallbacks,
                     updateText: React.Dispatch<React.SetStateAction<Text>>) {
    if (resetInProgress) {
        // already reading all the text
        return
    }
    console.log("Requesting resend of all text...")
    resetInProgress = true
    // reset the current text
    updateText({ live: '', past: '' })
    // request the whisperer to send all the text
    channel.publish(publisherId, "-20|all")
}

function processChunk(chunk: string,
                      updateText: React.Dispatch<React.SetStateAction<Text>>) {
    function isDiff(chunk: string): boolean {
        return chunk.startsWith('-1') || !chunk.startsWith('-')
    }
    if (chunk.startsWith('-9|')) {
        console.log("Received request to play sound")
    } else if (resetInProgress) {
        if (chunk.startsWith('-4|')) {
            console.log("Received reset acknowledgement from whisperer, clearing past text")
            updateText((text: Text) => {
                return { live: text.live, past: '' }
            })
        } else if (isDiff(chunk)) {
            console.log("Ignoring diff chunk because a read is in progress")
        } else if (chunk.startsWith('-1|') || chunk.startsWith('-2|')) {
            console.log("Prepending past line chunk")
            updateText((text: Text) => {
                return { live: text.live, past: chunk.substring(3) + '\n' + text.past }
            })
        } else if (chunk.startsWith('-3|')) {
            console.log("Receive live text chunk, update is over")
            updateText((text: Text) => {
                return { live: chunk.substring(3), past: text.past }
            })
            resetInProgress = false
        }
    } else {
        if (!isDiff(chunk)) {
            console.log("Ignoring non-diff chunk because no read in progress")
        } else if (chunk.startsWith('0|')) {
            updateText((text: Text) => {
                return { live: chunk.substring(3), past: text.past }
            })
        } else if (chunk.startsWith('-1|')) {
            console.log("Prepending live text to past line")
            updateText((text: Text) => {
                return { live: '', past: text.live + '\n' + text.past }
            })
        } else {
            const [offsetDigits, suffix] = chunk.split('|', 1)
            const offset = parseInt(offsetDigits)
            updateText((text: Text) => {
                return { live: text.live.substring(0, offset) + suffix, past: text.past }
            })
        }
    }
}
