// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useState} from 'react'
import Cookies from 'js-cookie'
import {AblyProvider, useChannel} from 'ably/react'
import * as Ably from 'ably'

const conversationId = Cookies.get('conversationId') || ''
const conversationName = Cookies.get('conversationName') || ''
const whispererName = Cookies.get('whispererName') || ''
const clientId = Cookies.get('clientId') || ''
let clientName = Cookies.get('clientName') || ''

if (!conversationId || !whispererName || !clientId || !conversationName) {
    window.location.href = "/subscribe404.html"
}

const client = new Ably.Realtime.Promise({
    clientId: clientId,
    authUrl: '/api/subscribeTokenRequest',
    echoMessages: false,
})

interface Text {
    live: string,
    past: string,
}

export default function ListenerView() {
    const [connected, setConnected] = useState(true)
    const [listenerName, setListenerName] = useState(clientName)
    if (!listenerName) {
        return <NameView name={listenerName} setName={setListenerName} />
    } else if (!connected) {
        return <DisconnectedView />
    } else {
        return (
            <AblyProvider client={client}>
                <ConnectView terminate={() => setConnected(false)} />
            </AblyProvider>
        )
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
            <h1>Advisory</h1>
            <p>
                By entering your name below, you are agreeing to receive
                messages sent by another user (the Whisperer) in
                a remote location.  Your name and agreement will be remembered
                in this browser for all conversations with all Whisperers
                until you clear your browser's cookies for this site.
            </p>
            <h2>Please provide your name to the Whisperer:</h2>
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
                Agree & Save Name
            </button>
        </>
    )
}

function DisconnectedView() {
    return (
        <>
            <h1>The conversation with {whispererName} has ended</h1>
            <p>
                You can close this window or
                <a href={window.location.href}>click here to listen again</a>.
            </p>
        </>
    )
}

function ConnectView(props: { terminate: () => void }) {
    const [status, setStatus] = useState(`initial`)
    const { channel } = useChannel(
        `${conversationId}:control`,
        m => receiveControlChunk(m, setStatus, props.terminate))
    doCount(() => sendListenOffer(channel), 'initialOffer', 1)
    const rereadLiveText = () => sendRereadText(channel)
    if (status.match(/^[A-Za-z-]{36}$/)) {
        return <ConnectedView contentId={status} reread={rereadLiveText} />
    } else {
        return <ConnectingView status={status} />
    }
}

function ConnectingView(props: { status: string }) {
    let message: string
    switch (props.status) {
        case 'initial':
            message = `Starting to connect...`
            break
        case 'authenticating':
            message = `Requesting permission to join the conversation...`
            break
        case 'aborted':
            message = `Conversation terminated at user request`
            break
        case 'denied':
            message = `Listener refused entry into the conversation`
            break
        default:
            message = `Connection complete, starting to listen...`
    }
    return (
        <>
            <h1>Conversation “{conversationName}” with {whispererName}</h1>
            <form>
                <textarea rows={1} id="status" value={message} />
            </form>
        </>
    )
}

function ConnectedView(props: { contentId: string, reread: () => void }) {
    const [text, updateText] = useState({ live: '', past: '' } as Text)
    useChannel(
        `${conversationId}:${props.contentId}`,
        (m) => receiveContentChunk(m, updateText, props.reread)
    )
    return (
        <>
            <h1>Conversation “{conversationName}” with {whispererName}</h1>
            <form>
                <LivePastText text={text} reread={props.reread}/>
            </form>
        </>
    )
}

function LivePastText(props: { text: Text, reread: () => void }) {
    doCount(props.reread, 'initialRead', 1)
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

function receiveControlChunk(message: Ably.Types.Message,
                             setStatus: React.Dispatch<React.SetStateAction<string>>,
                             terminate: () => void) {
    const me = clientId.toUpperCase()
    const topic = message.name.toUpperCase()
    if (topic != me && topic != "ALL") {
        // ignoring message for another client
        return
    }
    const info = parseControlChunk(message.data)
    if (!info) {
        console.error(`Ignoring invalid control packet: ${message.data}`)
        setStatus(`Ignoring an invalid packet; see log for details`)
        return
    }
    switch (info.offset) {
        case 'dropping':
            console.log(`Whisperer is dropping this client`)
            terminate()
            break
        case 'listenAuthYes':
            console.log(`Received content id: ${info.contentId}`)
            if (info.contentId.match(/^[A-Za-z-]{36}$/)) {
                setStatus(info.contentId)
            } else {
                console.error(`Invalid content id: ${info.contentId}`)
                alert("Communication error: invalid channel id!")
                terminate()
            }
            break
        case 'listenAuthNo':
            console.log(`Whisperer refused listener presence`)
            setStatus('denied')
            setTimeout(terminate, 1000)
            break
        case 'whisperOffer':
            console.log(`Received Whisper offer, sending request`)
    }
}

let resetInProgress = false

function receiveContentChunk(message: Ably.Types.Message,
                             updateText: React.Dispatch<React.SetStateAction<Text>>,
                             reread: () => void) {
    const me = clientId.toUpperCase()
    const topic = message.name.toUpperCase()
    const chunk = message.data as string
    if (topic != me && topic != "ALL") {
        // ignoring message for another client
        return
    }
    if (chunk.startsWith('-9|')) {
        console.warn(`Received request to play ${chunk.substring(3)} sound, but can't do that`)
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
            updateText((text: Text): Text => {
                if (!offset || offset > text.live.length) {
                    reread()
                    return text
                } else {
                    return { live: text.live.substring(0, offset) + suffix, past: text.past }
                }
            })
        }
    }
}

interface ClientInfo {
    offset: string,
    conversationId: string,
    conversationName: string,
    clientId: string,
    profileId: string,
    username: string,
    contentId: string,
}

function parseOffset(offset: string): string | undefined {
    switch (parseInt(offset)) {
        case -20: return "whisperOffer";
        case -21: return "listenRequest";
        case -22: return "listenAuthYes";
        case -23: return "listenAuthNo";
        case -24: return "joining";
        case -25: return "dropping";
        case -26: return "listenOffer";
        default: return undefined
    }
}

function parseControlChunk(chunk: String) {
    const parts = chunk.split('|')
    const offset = parseOffset(parts[0])
    if (parts.length != 7 || !offset) {
        return undefined
    }
    const info: ClientInfo = {
        offset,
        conversationId: parts[1],
        conversationName: parts[2],
        clientId: parts[3],
        profileId: parts[4],
        username: parts[5],
        contentId: parts[6],
    }
    return info
}

function isDiff(chunk: string): boolean {
    return chunk.startsWith('-1') || !chunk.startsWith('-')
}

function sendListenOffer(channel: Ably.Types.RealtimeChannelPromise) {
    console.log(`Sending listen offer`)
    let chunk = `-26|${conversationId}||${clientId}|${clientId}||`
    channel.publish("listener", chunk).then()
}

function sendRereadText(channel: Ably.Types.RealtimeChannelPromise) {
    if (resetInProgress) {
        // already re-reading all the text
        return
    }
    console.log("Requesting resend of live text...")
    resetInProgress = true
    // request the whisperer to send all the text
    channel.publish(conversationId, "-20|live").then()
}

const doneCounts: {[p: string]: number} = { }

function doCount(fn: (() => void), which: string, max: number) {
    const doneCount = doneCounts[which] || 0
    if (doneCount < max) {
        doneCounts[which] = doneCount + 1
        fn()
    }
}
