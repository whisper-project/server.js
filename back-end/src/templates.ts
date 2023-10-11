// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

export function subscribe_response(publisher_name: string) {
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Listening to ${publisher_name}</title>
                <meta http-equiv="refresh" content="2; url=/listen/index.html">
            </head>
            <body>
                <h1>Listening to ${publisher_name}</h1>
                <p>The whisper server is preparing your connection.  Please wait...</p>
            </body>
            </html>`
}
