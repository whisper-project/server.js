// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import { createApnsJwt } from "./auth.js";

async function testJwt() {
    const jwt = await createApnsJwt()
    console.log(jwt)
}

testJwt().then(() => { console.log('Tests completed successfully') })
