// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import * as jose from 'jose'

export async function createApnsJwt() {
    const alg = 'ES256'
    const secret = process.env['APNS_CRED_SECRET_PKCS8'] || 'Fake key that will fail'
    const keyId = process.env['APNS_CRED_ID'] || 'Fake key id that will fail'
    const teamId = process.env['APNS_TEAM_ID'] || 'Fake team id that will fail'
    const privateKey = await jose.importPKCS8(secret, alg)

    return await new jose.SignJWT({})
        .setProtectedHeader({ alg, kid: keyId })
        .setIssuer(teamId)
        .setIssuedAt()
        .sign(privateKey)
}