/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package platform

import (
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
)

func TestMakeSha1(t *testing.T) {
	emptySha1Bytes, err := hex.DecodeString("da39a3ee5e6b4b0d3255bfef95601890afd80709")
	if err != nil {
		t.Fatal(err)
	}
	emptySha1Base64 := base64.URLEncoding.EncodeToString(emptySha1Bytes)
	computedSha1Base64 := MakeSha1("")
	if computedSha1Base64 != emptySha1Base64 {
		t.Errorf("computedSha1Base64 should be %q but is %q", emptySha1Base64, computedSha1Base64)
	}
}

func TestGenerateRandomId(t *testing.T) {
	id := generateRandomId(0)
	if len(id) != 16 {
		t.Errorf("id should be 16 chars long but is %d", len(id))
	}
	id = generateRandomId(24)
	if len(id) != 24 {
		t.Errorf("id should be 24 chars long but is %d", len(id))
	}
}

func TestNewId(t *testing.T) {
	prefix := "test-prefix-"
	id1 := NewId(prefix)
	if !strings.HasPrefix(id1, prefix) {
		t.Errorf("id1 should start with test-prefix-")
	}
	eLen := len(prefix) + 16
	if len(id1) != eLen {
		t.Errorf("id1 should have length %d, but is %d", eLen, len(id1))
	}
	id2 := NewId(prefix)
	if id1 == id2 {
		t.Errorf("id1 should not equal id2")
	}
}
