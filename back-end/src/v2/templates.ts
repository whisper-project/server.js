// Copyright 2023-2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { TranscriptData } from './transcribe.js'
import { getConversationInfo } from '../profile.js'
import { escape } from 'html-escaper'

export function subscribeResponse(conversation_name: string, whisperer_name: string) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Listen to ${whisperer_name}</title>
    <meta http-equiv="refresh" content="0; url=/listen/index2.html">
</head>
<body>
    <p>Preparing your connection to ${whisperer_name}.  Please wait...</p>
</body>
</html>
`
}

export async function transcriptResponse(tr: TranscriptData) {
    const con = await getConversationInfo(tr.conversationId)
    const minutes = Math.round(tr.duration! / (60 * 1000))
    const start: string = Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour12: true,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(new Date(tr.startTime))
    let duration = `${minutes} min`
    if (minutes < 1) {
        const seconds = Math.floor(minutes / 1000)
        duration = `${seconds} sec`
    } else if (minutes > (24 * 60)) {
        const days = Math.floor(minutes / (24 * 60))
        const hours = Math.floor((minutes % (24 * 60)) / 60)
        duration = `${days} day ${hours} hr`
    } else if (minutes > 90) {
        const hours = Math.floor(minutes / 60)
        duration = `${hours} hr ${minutes % 60} min`
    }
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="apple-touch-icon" sizes="57x57" href="/img/apple-icon-57x57.png">
    <link rel="apple-touch-icon" sizes="60x60" href="/img/apple-icon-60x60.png">
    <link rel="apple-touch-icon" sizes="72x72" href="/img/apple-icon-72x72.png">
    <link rel="apple-touch-icon" sizes="76x76" href="/img/apple-icon-76x76.png">
    <link rel="apple-touch-icon" sizes="114x114" href="/img/apple-icon-114x114.png">
    <link rel="apple-touch-icon" sizes="120x120" href="/img/apple-icon-120x120.png">
    <link rel="apple-touch-icon" sizes="144x144" href="/img/apple-icon-144x144.png">
    <link rel="apple-touch-icon" sizes="152x152" href="/img/apple-icon-152x152.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-icon-180x180.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/img/android-icon-192x192.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/img/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16x16.png">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
    <link rel="stylesheet" href="/css/transcript.css">
    <title>Transcript of ${con?.name || 'Unknown Conversation'}</title>
</head>
<body>
<div class="transcript">
<h2>Transcript of ${con?.name || 'Unknown Conversation'}</h2>
<div class="duration">
    <p>Started at ${start}, lasted ${duration}</p>
</div>
`
    const lines = tr.transcription!.split('\n')
    let inParagraph = false
    let emptyLineAbove = false
    for (const line of lines) {
        if (line === '') {
            if (emptyLineAbove) {
                // multiple empty lines are ignored
            } else {
                if (inParagraph) {
                    html += `</p>\n`
                    inParagraph = false
                }
                emptyLineAbove = true
            }
        } else {
            if (inParagraph) {
                html += `<br>\n` + escape(line)
            } else {
                html += `\n<p>${line}`
            }
            inParagraph = true
            emptyLineAbove = false
        }
    }
    if (inParagraph) {
        html += `</p>\n`
    }
    html += `
</body>
</html>
`
    return html
}

