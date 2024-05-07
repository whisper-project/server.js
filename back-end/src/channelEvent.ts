// Copyright 2024 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

export interface ChannelEvent {
    clientId: string,
    participant: string,
    conversationId: string,
    channelId: string,
    event: string,
    resumed: string,
    errCode: string,
    errMessage: string,
}