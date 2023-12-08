// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.

import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from "./subscribe1"

// @ts-ignore
const root = createRoot(document.getElementById("root"))
root.render(
    <StrictMode>
        <App />
    </StrictMode>
)
