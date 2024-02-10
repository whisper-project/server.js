// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, {useEffect, useState} from 'react'
import Cookies from 'js-cookie'
import {AblyProvider, useChannel} from 'ably/react'
import * as Ably from 'ably'

import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'

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
    authUrl: '/api/v2/listenTokenRequest',
    echoMessages: false,
})

interface Text {
    live: string,
    past: string,
}

export default function ListenerView() {
    const [exitMsg, setExitMsg] = useState('')
    const [listenerName, setListenerName] = useState('')
    if (!listenerName) {
        return <NameView confirm={(msg) => setListenerName(msg)} />
    } else if (exitMsg) {
        return <DisconnectedView message={exitMsg}/>
    } else {
        return (
            <AblyProvider client={client}>
                <ConnectView exit={(msg) => setExitMsg(msg)} />
            </AblyProvider>
        )
    }
}

function NameView(props: { confirm: (msg: string) => void} ) {
    const [name, setName] = useState(clientName)

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        setName(e.target.value)
    }

    function onConfirm() {
        clientName = name
        Cookies.set('clientName', clientName, { expires: 365 })
        props.confirm(name)
    }

    return (
        <Stack spacing={5}>
            <Typography variant="h4" gutterBottom>
                Advisory
            </Typography>
            <Typography maxWidth={'60ch'}>
                By entering your name below, you are agreeing to receive
                messages sent by another user (the Whisperer) in
                a remote location.  The name you enter here will be
                revealed to that person.
            </Typography>
            <Typography variant="h5" gutterBottom>
                Please provide your name to the Whisperer:
            </Typography>
            <Grid container component="form" noValidate autoComplete="off">
                <Grid item>
                    <TextField
                        id="outlined-basic"
                        label="Listener Name"
                        variant="outlined"
                        style={{ width: '40ch' }}
                        value={name}
                        onChange={onChange}
                    />
                </Grid>
                <Grid item alignItems="stretch" style={{ display: 'flex' }}>
                    <Button variant="contained" onClick={onConfirm}>
                        Agree & Provide Name
                    </Button>
                </Grid>
            </Grid>
        </Stack>
    )
}

function DisconnectedView(props: { message: string }) {
    console.log("Waiting a second to drain messages, then closing client")
    setTimeout(() => client.close(), 1000)
    return (
        <Stack spacing={5}>
            <Typography variant="h4">Disconnected from conversation “{conversationName}”</Typography>
            {props.message != 'user-initiated-disconnect' && <Typography>{props.message}</Typography>}
            <Typography>
                You can close this window or <a href={window.location.href}>click here to listen again</a>.
            </Typography>
        </Stack>
    )
}

function ConnectView(props: { exit: (msg: string) => void }) {
    const [status, setStatus] = useState('waiting')
    const { channel } = useChannel(
        `${conversationId}:control`,
        m => receiveControlChunk(m, channel, setStatus, props.exit))
    hookUnload(() => {
        sendDrop(channel)
        setTimeout(() => props.exit('Trying to close the window closes the connection.'), 1000)
    })
    const exit = (msg: string) => {
        sendDrop(channel)
        props.exit(msg)
    }
    doCount(() => sendListenOffer(channel), 'initialOffer', 1)
    const rereadLiveText = () => sendRereadText(channel)
    return (
        <Stack spacing={5}>
            <Typography variant="h4">Conversation “{conversationName}” with {whispererName}</Typography>
            <StatusView status={status} exit={exit}/>
            {status.match(/^[A-Za-z0-9-]{36}$/) &&
                <ConversationView contentId={status} reread={rereadLiveText}/>
            }
        </Stack>
    )
}

function StatusView(props: { status: string, exit: (msg: string) => void }) {
    let message: string
    const disconnect = () => props.exit('user-initiated-disconnect')
    switch (props.status) {
        case 'waiting':
            message = `Waiting for ${whispererName} to join...`
            break
        case 'requesting':
            message = `Requesting permission to join the conversation...`
            break
        default:
            if (props.status.match(/^[A-Za-z0-9-]{36}$/)) {
                message = "Connected and listening..."
            } else {
                message = `Something has gone wrong (invalid status ${props.status}).`
                setTimeout(
                    () => props.exit(`A connection error occurred.  Please try refreshing this window.`),
                    250
                )
            }
    }
    return (
        <Grid container component="form" noValidate autoComplete="off">
            <Grid item>
                <TextField
                    id="outlined-basic"
                    label="Connection Status"
                    variant="outlined"
                    style={{ width: '60ch' }}
                    value={message}
                    disabled
                />
            </Grid>
            <Grid item alignItems="stretch" style={{ display: 'flex' }}>
                <Button variant="contained" onClick={disconnect}>
                    Leave Conversation
                </Button>
            </Grid>
        </Grid>
    )
}

function ConversationView(props: { contentId: string, reread: () => void }) {
    const [text, updateText] = useState({live: '', past: ''} as Text)
    useChannel(
        `${conversationId}:${props.contentId}`,
        (m) => receiveContentChunk(m, updateText, props.reread)
    )
    doCount(props.reread, 'initialRead', 1)
    return (
        <LivePastText text={text} />
    )
}

function LivePastText(props: { text: Text }) {
    return (
        <>
            <TextField
                multiline
                disabled
                rows={3}
                value={props.text.live}
            />
            <TextField
                multiline
                disabled
                id="pastText"
                rows={15}
                value={props.text.past}
            />
        </>
    )
}

function receiveControlChunk(message: Ably.Types.Message,
                             channel: Ably.Types.RealtimeChannelPromise,
                             setStatus: React.Dispatch<React.SetStateAction<string>>,
                             exit: (msg: string) => void) {
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
            exit(`${whispererName} has stopped whispering.`)
            break
        case 'listenAuthYes':
            console.log(`Received content id: ${info.contentId}`)
            if (info.contentId.match(/^[A-Za-z0-9-]{36}$/)) {
                console.log(`Joining the conversation`)
                const offset = controlOffsetValue('joining')
                const chunk = `${offset}|${conversationId}|${info.conversationName}|${clientId}|${clientId}|${clientName}|`
                channel.publish(info.clientId, chunk).then()
                setStatus(info.contentId)
            } else {
                console.error(`Invalid content id: ${info.contentId}.  Please report a bug!`)
                sendDrop(channel)
                exit(`There was a communication error (invalid channel id).  Please report a bug.`)
            }
            break
        case 'listenAuthNo':
            console.log(`Whisperer refused listener presence`)
            sendDrop(channel)
            exit(`${whispererName} has refused to let you join this conversation`)
            break
        case 'whisperOffer':
            console.log(`Received Whisper offer, sending request`)
            setStatus('requesting')
            console.log(`Received whisper offer from ${info.clientId}, sending listen request`)
            const offset = controlOffsetValue('listenRequest')
            const chunk = `${offset}|${conversationId}|${info.conversationName}|${clientId}|${clientId}|${clientName}|`
            channel.publish(info.clientId, chunk).then()
    }
}

let resetInProgress = false

function receiveContentChunk(message: Ably.Types.Message,
                             updateText: React.Dispatch<React.SetStateAction<Text>>,
                             reread: () => void) {
    const me = clientId.toUpperCase()
    const topic = message.name.toUpperCase()
    if (topic != me && topic != "ALL") {
        // ignoring message for another client
        return
    }
    const chunk = parseContentChunk(message.data as string)
    if (!chunk) {
        console.error(`Ignoring invalid content chunk: ${message.data as string}`)
        return
    }
    if (resetInProgress) {
        if (chunk.offset === 'startReread') {
            console.log("Received reset acknowledgement from whisperer, resetting live text")
            updateText((text: Text) => {
                return { live: '', past: text.past }
            })
        } else if (chunk.isDiff) {
            console.log("Ignoring diff chunk because a read is in progress")
        } else if (chunk.offset === 'pastText') {
            console.log("Received unexpected past line chunk, ignoring it")
        } else if (chunk.offset === 'liveText') {
            console.log("Receive live text chunk, update is over")
            resetInProgress = false
            updateText((text: Text) => {
                return { live: chunk.text, past: text.past }
            })
        }
    } else if (chunk.isDiff) {
        if (chunk.offset === 0) {
            updateText((text: Text) => {
                return { live: chunk.text, past: text.past }
            })
        } else if (chunk.offset === 'newline') {
            console.log("Prepending live text to past line")
            updateText((text: Text) => {
                return { live: '', past: text.live + '\n' + text.past }
            })
        } else {
            const offset = chunk.offset as number
            updateText((text: Text): Text => {
                if (offset > text.live.length) {
                    console.log(`Received offset ${offset} with text length ${text.live.length}, rereading...`)
                    reread()
                    return text
                } else {
                    return { live: text.live.substring(0, offset) + chunk.text, past: text.past }
                }
            })
        }
    } else {
        if (typeof chunk.offset === 'string') {
            console.warn(`Ignoring ${chunk.offset} content request for: ${chunk.text}`)
        } else {
            console.error(`Unimplemented content chunk with offset ${chunk.offset} text: ${chunk.text}`)
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

function parseControlOffset(offset: string): string | undefined {
    switch (offset) {
        case '-20': return 'whisperOffer';
        case '-21': return 'listenRequest';
        case '-22': return 'listenAuthYes';
        case '-23': return 'listenAuthNo';
        case '-24': return 'joining';
        case '-25': return 'dropping';
        case '-26': return 'listenOffer';
        case '-40': return 'requestReread'
        default: return undefined
    }
}

function controlOffsetValue(offset: string): string | undefined {
    switch (offset) {
        case 'whisperOffer': return '-20'
        case 'listenRequest': return '-21'
        case 'listenAuthYes': return '-22'
        case 'listenAuthNo': return '-23'
        case 'joining': return '-24'
        case 'dropping': return '-25'
        case 'listenOffer': return '-26'
        case 'requestReread': return '-40'
        default: return undefined
    }
}

function parseControlChunk(chunk: String) {
    const parts = chunk.split('|')
    const offset = parseControlOffset(parts[0])
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

interface ContentChunk {
    isDiff: boolean
    offset: string | number
    text: string
}

function parseContentChunk(chunk: String) {
    const parts = chunk.match(/^(-?[0-9]+)\|(.*)$/)
    if (!parts || parts.length != 3) {
        return undefined
    }
    const offsetNum = parseInt(parts[1])
    if (isNaN(offsetNum)) {
        return undefined
    }
    const parsed: ContentChunk = {
        isDiff: offsetNum >= -1,
        offset: parseContentOffset(offsetNum) || offsetNum,
        text: parts[2] || ''
    }
    return parsed
}

function parseContentOffset(offset: number) {
    switch (offset) {
        case -1: return 'newline'
        case -2: return 'pastText'
        case -3: return 'liveText'
        case -4: return 'startReread'
        case -6: return 'clearHistory'
        case -7: return 'playSound'
        case -8: return 'playSpeech'
        default: return undefined
    }
}

function sendDrop(channel: Ably.Types.RealtimeChannelPromise) {
    console.log(`Sending drop message`)
    let chunk = `${controlOffsetValue('dropping')}|||${clientId}|||`
    channel.publish("whisperer", chunk).then()
}

function sendListenOffer(channel: Ably.Types.RealtimeChannelPromise) {
    console.log(`Sending listen offer`)
    let chunk = `${controlOffsetValue('listenOffer')}|${conversationId}||${clientId}|${clientId}||`
    channel.publish("whisperer", chunk).then()
}

function sendRereadText(channel: Ably.Types.RealtimeChannelPromise) {
    if (resetInProgress) {
        // already re-reading all the text
        return
    }
    console.log("Requesting resend of live text...")
    resetInProgress = true
    // request the whisperer to send all the text
    let chunk = `${controlOffsetValue('requestReread')}|live`
    channel.publish("whisperer", chunk).then()
}

function hookUnload(fn: () => void) {
    useEffect(() => {
        const handleClose = (event: BeforeUnloadEvent) => {
            console.log("Running beforeunload hook...")
            event.preventDefault()
            fn()
            return (event.returnValue = 'Are you sure? Closing the window will close the connection.')
        }
        window.addEventListener('beforeunload', handleClose)
        return () => { window.removeEventListener('beforeunload', handleClose)}
    }, []);
}

const doneCounts: {[p: string]: number} = { }

function doCount(fn: (() => void), which: string, max: number) {
    const doneCount = doneCounts[which] || 0
    if (doneCount < max) {
        doneCounts[which] = doneCount + 1
        fn()
    }
}
