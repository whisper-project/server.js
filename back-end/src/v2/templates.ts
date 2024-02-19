// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

export function subscribe_response(conversation_name: string, whisperer_name: string) {
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
