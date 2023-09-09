"use strict";
// Copyright 2023 Daniel C. Brotsky. All rights reserved.
// Licensed under the GNU Affero General Public License v3.
// See the LICENSE file for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSettings = exports.getSettings = void 0;
var dotenv_1 = require("dotenv");
var loadedConfig;
function getSettings() {
    if (!loadedConfig) {
        throw Error("You must load settings before you get them.");
    }
    return loadedConfig;
}
exports.getSettings = getSettings;
function loadSettings(name) {
    if (name === void 0) { name = 'env'; }
    name = name.toLowerCase();
    if (name === 'env') {
        (0, dotenv_1.config)();
        loadedConfig = envSettings();
    }
    else if (name === 'test') {
        loadedConfig = testSettings();
    }
    else {
        throw Error("Can't load a config named ".concat(name));
    }
}
exports.loadSettings = loadSettings;
function envSettings() {
    var fromEnv = {
        ablyPublishKey: process.env['ABLY_PUBLISH_KEY'],
        apnsUrl: process.env['APNS_SERVER'],
        apnsCredSecret: process.env['APNS_CRED_SECRET_PKCS8'],
        apnsCredId: process.env['APNS_CRED_ID'],
        apnsTeamId: process.env['APNS_TEAM_ID'],
        dbUrl: process.env['REDISCLOUD_URL'],
        dbKeyPrefix: process.env['DB_KEY_PREFIX']
    };
    for (var key in fromEnv) {
        if (!fromEnv[key]) {
            throw Error("Can't find needed config ".concat(key, " in the environment"));
        }
    }
    return fromEnv;
}
function testSettings() {
    return {
        ablyPublishKey: 'xVLyHw.DGYdkQ:FtPUNIourpYSoZAIbeon0p_rJGtb5vO1j2OIzP3GMX8',
        ablySubscribeKey: 'xVLyHw.DGYdkQ:FtPUNIourpYSoZAIbeon0p_rJGtb5vO1j2OIzP3GMX8',
        apnsUrl: 'http://localhost:2197',
        apnsCredSecret: '-----BEGIN PRIVATE KEY----- MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5TL3GlhuHCFZe0L/ g+rt2ibfrgaGaiYl1/N2FAms0yehRANCAAT6nm9Bs5+HXOI2DRm9h1LtQxofxa1e lMN+WP8KFt9KQ/yKYohq4ZLtvdxfjoPobxPNm+VGkycP8zQMK3RAwJSu -----END PRIVATE KEY-----',
        apnsCredId: '89AB98CD89',
        apnsTeamId: '8CD8989AB9',
        dbUrl: 'redis://',
        dbKeyPrefix: 't:'
    };
}
