// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

interface PresenceInfo {
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
        case '-20':
            return 'whisperOffer'
        case '-21':
            return 'listenRequest'
        case '-22':
            return 'listenAuthYes'
        case '-23':
            return 'listenAuthNo'
        case '-24':
            return 'joining'
        case '-25':
            return 'dropping'
        case '-26':
            return 'listenOffer'
        case '-27':
            return 'restart'
        case '-40':
            return 'requestReread'
        default:
            return undefined
    }
}

export function controlOffsetValue(offset: string): string | undefined {
    switch (offset) {
        case 'whisperOffer':
            return '-20'
        case 'listenRequest':
            return '-21'
        case 'listenAuthYes':
            return '-22'
        case 'listenAuthNo':
            return '-23'
        case 'joining':
            return '-24'
        case 'dropping':
            return '-25'
        case 'listenOffer':
            return '-26'
        case 'restart':
            return '-27'
        case 'requestReread':
            return '-40'
        default:
            return undefined
    }
}

export function parsePresenceChunk(chunk: string) {
    const parts = chunk.split('|')
    const offset = parseControlOffset(parts[0])
    if (parts.length != 7 || !offset) {
        return undefined
    }
    const info: PresenceInfo = {
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

export function parseContentChunk(chunk: string) {
    const parts = chunk.match(/^(-?[0-9]+)\|(.*)$/)
    if (parts === null || parts.length != 3) {
        console.warn(`Can't parse content chunk: ${chunk}`)
        return undefined
    }
    const offsetNum = parseInt(parts[1])
    if (isNaN(offsetNum)) {
        console.warn(`Can't parse chunk offset: ${chunk}`)
        return undefined
    }
    const parsed: ContentChunk = {
        isDiff: offsetNum >= -1,
        offset: parseContentOffset(offsetNum) || offsetNum,
        text: parts[2] || '',
    }
    return parsed
}

function parseContentOffset(offset: number) {
    switch (offset) {
        case -1:
            return 'newline'
        case -2:
            return 'pastText'
        case -3:
            return 'liveText'
        case -4:
            return 'startReread'
        case -6:
            return 'clearHistory'
        case -7:
            return 'playSound'
        case -8:
            return 'playSpeech'
        default:
            return undefined
    }
}