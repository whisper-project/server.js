// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useState} from 'react'
import Cookies from 'js-cookie'
import {AblyProvider, useChannel, usePresence} from 'ably/react'
import * as Ably from 'ably'

const publisherId = Cookies.get('publisherId') || ''
let publisherName = Cookies.get('publisherName') || ''
const clientId = Cookies.get('clientId') || ''
let clientName = Cookies.get('clientName') || ''

if (!publisherId || !publisherName || !clientId) {
    window.location.href = "/subscribe404.html"
}

const client = new Ably.Realtime.Promise({
    clientId: clientId,
    authUrl: '/api/subscribeTokenRequest',
    echoMessages: false,
})

const channelName = `${publisherId}:whisper`
let hasConnected = false
let resetInProgress = false

interface Text {
    live: string,
    past: string,
}

const waitingToConnectText: Text = {
    live: 'This is where live text will appear',
    past: 'This is where past text will appear.\nThe newest lines will appear on top.',
}

const connectedText: Text = {
    live: '',
    past: '',
}

export default function ListenerView() {
    const [connection, setConnection] = useState("waiting")
    const [listenerName, setListenerName] = useState(clientName)
    if (connection == "disconnected") {
        return <DisconnectedView name={publisherName} />
    } else if (listenerName) {
        return (
            <AblyProvider client={client}>
                <ConnectionView setConnection={setConnection}/>
            </AblyProvider>
        )
    } else {
        return <NameView name={listenerName} setName={setListenerName} />
    }
}

function NameView(props: { name: String, setName: React.Dispatch<React.SetStateAction<string>>} ) {
    const [client, updateClient] = useState(props.name)

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        clientName = e.target.value
        updateClient(clientName)
    }

    function onUpdate() {
        props.setName(clientName)
        Cookies.set('clientName', clientName, { expires: 365 })
    }

    return (
        <>
            <h2>Please provide your name to the whisperer:</h2>
            <input
                name="listenerName"
                id="listenerName"
                type="text"
                value={client.valueOf()}
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

function DisconnectedView(props: { name: String }) {
    return (
        <>
            <h1>{props.name} has stopped whispering</h1>
            <p>You can close this window or <a href="/listen/index1.html">click here to reconnect</a>.</p>
        </>
    )
}

function ConnectionView(props: { setConnection: React.Dispatch<React.SetStateAction<string>> }) {
    const [whisperer, updateWhisperer] = useState(`Connecting to ${publisherName}...`)
    const [text, updateText] = useState(waitingToConnectText)
    const { channel } = useChannel(
        channelName,
        (message) =>
            receiveChunk(message, channel, props.setConnection, updateWhisperer, updateText))
    usePresence(channelName, clientName, message => {
        receivePresence(
            message as Ably.Types.PresenceMessage, channel, props.setConnection, updateWhisperer, updateText
        )
    })
    return (
        <>
            <PublisherName whisperer={whisperer}/>
            <form>
                <LivePastText text={text}/>
            </form>
        </>
    )
}

function PublisherName(props: { whisperer: string }) {
    return <h1>{props.whisperer}</h1>
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

function receiveChunk(message: Ably.Types.Message,
                      channel: Ably.Types.RealtimeChannelPromise,
                      setConnection: React.Dispatch<React.SetStateAction<string>>,
                      updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                      updateText: React.Dispatch<React.SetStateAction<Text>>) {
    maybeConnect("content", channel, setConnection, updateWhisperer, updateText)
    if (message.name.toUpperCase() === clientId.toUpperCase()) {
        console.log(`Received chunk directed here: ${message.data}`)
        const [offset, text] = (message.data as string).split("|", 2)
        if (offset === "-21" && text.toUpperCase() === clientId.toUpperCase()) {
            console.log(`Whisperer is dropping this client`)
            disconnect("content", channel, setConnection, updateWhisperer)
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

function receivePresence(message: Ably.Types.PresenceMessage,
                         channel: Ably.Types.RealtimeChannelPromise,
                         setConnection: React.Dispatch<React.SetStateAction<string>>,
                         updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                         updateText: React.Dispatch<React.SetStateAction<Text>>) {
    if (message.clientId.toUpperCase() == clientId.toUpperCase()) {
        console.log(`Ignoring self presence message: ${message.action}, ${message.data}`)
    } else if (message.clientId.toUpperCase() === publisherId.toUpperCase()) {
        console.log(`Received presence from Whisperer: ${message.action}, ${message.data}`)
        if (['present', 'enter', 'update'].includes(message.action)) {
            publisherName = message.data
            maybeConnect("presence", channel, setConnection, updateWhisperer, updateText)
        } else if (['leave', 'absent'].includes(message.action)) {
            disconnect('presence', channel, setConnection, updateWhisperer)
        }
    } else {
        console.log(`Ignoring presence message: ${message.clientId}, ${message.data}, ${message.action}`)
    }
}

function maybeConnect(messageType: string,
                      channel: Ably.Types.RealtimeChannelPromise,
                      setConnection: React.Dispatch<React.SetStateAction<string>>,
                      updateWhisperer: React.Dispatch<React.SetStateAction<string>>,
                      updateText: React.Dispatch<React.SetStateAction<Text>>) {
    if (!hasConnected) {
        hasConnected = true
        console.log(`Connecting due to first message of type ${messageType}`)
        setConnection("connected")
        updateWhisperer(`Connected to ${publisherName}`)
        updateText(connectedText)
        readLiveText(channel)
    }
}

function disconnect(messageType: string,
                    channel: Ably.Types.RealtimeChannelPromise,
                    setConnection: React.Dispatch<React.SetStateAction<string>>,
                    updateWhisperer: React.Dispatch<React.SetStateAction<string>>) {
    console.log(`Disconnecting due to message of type: ${messageType}`)
    setConnection("disconnected")
    updateWhisperer(`Disconnected from ${publisherName}`)
    channel.detach()
}

function readLiveText(channel: Ably.Types.RealtimeChannelPromise) {
    if (resetInProgress) {
        // already reading all the text
        return
    }
    console.log("Requesting resend of live text...")
    resetInProgress = true
    // request the whisperer to send all the text
    channel.publish(publisherId, "-20|live")
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
            console.log("Received reset acknowledgement from whisperer, resetting live text")
            updateText((text: Text) => {
                return { live: '', past: text.past }
            })
        } else if (isDiff(chunk)) {
            console.log("Ignoring diff chunk because a read is in progress")
        } else if (chunk.startsWith('-1|') || chunk.startsWith('-2|')) {
            console.log("Received unexpected past line chunk, ignoring it")
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
                return { live: chunk.substring(2), past: text.past }
            })
        } else if (chunk.startsWith('-1|')) {
            console.log("Prepending live text to past line")
            updateText((text: Text) => {
                return { live: '', past: text.live + '\n' + text.past }
            })
        } else {
            const [offsetDigits, suffix] = chunk.split('|', 2)
            const offset = parseInt(offsetDigits)
            updateText((text: Text) => {
                return { live: text.live.substring(0, offset) + suffix, past: text.past }
            })
        }
    }
}
