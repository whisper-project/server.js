/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package platform

import (
	"crypto/sha1"
	"encoding/base64"

	"github.com/dchest/uniuri"
)

// MakeSha1 returns the hex of the SHA1 hash of the given string.
func MakeSha1(s string) string {
	// from https://stackoverflow.com/a/10701951/558006
	hashFn := sha1.New()
	hashFn.Write([]byte(s))
	return base64.URLEncoding.EncodeToString(hashFn.Sum(nil))
}

func generateRandomId(length int) string {
	if length <= 0 {
		return uniuri.New() // 16 chars - 95 bits of entropy
	}
	return uniuri.NewLen(length)
}

// NewId returns a new random id with the given prefix.
func NewId(prefix string) string {
	return prefix + generateRandomId(16)
}
