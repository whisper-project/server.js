// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useState} from 'react'
import {configureAbly, useChannel, usePresence} from '@ably-labs/react-hooks'

const urlParams = new URLSearchParams(window.location.search)
const publisherId = urlParams.get('publisherId') || ''
const clientId = urlParams.get('clientId') || ''
if (!publisherId || !clientId) {
    window.location.href = "/subscribe404.html"
}

configureAbly({authUrl: '/api/'})
const channelName = `${publisherId}:whisper`
let resetInProgress: boolean = false

export default function ListenView() {
    const [whisperer, updateWhisperer] = useState(publisherId)
    const [client, updateClient] = useState(clientId)
    const [liveText, updateLiveText] = useState('This is where live text will appear')
    const [pastText, updatePastText] = useState('This is where past text will appear')
    const [channel] = useChannel(
        channelName,
        (message) => receiveChunk(message, liveText, updateLiveText, pastText, updatePastText))
    const [_presence, updatePresence] = usePresence(
        channelName,
        client,
        (message) => receivePresence(
            message, channel, updateLiveText, updatePastText, updateWhisperer))

    function updateClientEverywhere(name: string) {
        updateClient(name)
        updatePresence(name)
    }
    return (
        <>
            <PublisherName whisperer={whisperer}/>
            <ClientName client={client} onClientChange={updateClientEverywhere} />
            <LiveText liveText={liveText} />
            <PastText pastText={pastText} />
        </>
    )
}

function PublisherName({ whisperer }) {
    return <h1>Listening to {whisperer}</h1>
}

function ClientName({ client, onClientChange }) {
    return (
        <form>
            <input
                type="text"
                value={client}
                onChange={ (e) => onClientChange(e.target.value) } />
        </form>
    )
}

function LiveText({ liveText }) {
    return (
        <form>
            <textarea
                rows={ 4 }
                cols={ 100 }>
                {liveText}
            </textarea>
        </form>
    )
}

function PastText({ pastText }) {
    return (
        <form>
            <textarea
                rows={ 25 }
                cols={ 100 }>
                {pastText}
            </textarea>
        </form>
    )
}

function receiveChunk(message, liveText, updateLiveText, pastText, updatePastText) {
    if (message.name === clientId) {
        const [offset, text] = (message.data as string).split("|", 1)
        if (offset === "-21" && text === clientId) {
            window.location.href = "connectionLost.html"
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

function receivePresence(message, channel, updateLiveText, updatePastText, updateWhisperer) {
    if (message.clientId === publisherId) {
        updateWhisperer(message.data)
        // auto-subscribe
        readAllText(channel, updateLiveText, updatePastText)
    }
}

function readAllText(channel, updateLiveText, updatePastText) {
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

function processChunk(chunk: string, liveText, updateLiveText, pastText, updatePastText) {
    if (chunk.startsWith('-9|')) {
        console.log("Received request to play sound")
    } else if (resetInProgress) {
        if (chunk.startsWith('-4|')) {
            console.log("Received reset acknowledgement from whisperer, clearing past text")
            updatePastText('')
        } else if (!chunk.startsWith('-')) {
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
        if (chunk.startsWith('-')) {
            console.log("Ignoring non-diff chunk because no read in progress")
        } else if (chunk.startsWith('0|')) {
            updateLiveText(chunk.substring(3))
        } else if (chunk.startsWith('-1|') || chunk.startsWith('-2|')) {
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
