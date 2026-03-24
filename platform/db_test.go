/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package platform

import (
	"strings"
	"testing"
)

func TestGetDb(t *testing.T) {
	env := GetConfig()
	defer func() {
		if err := recover(); err != nil {
			t.Fatalf("Test environment %q has an invalid database URL %q", env.Name, env.DbUrl)
		}
	}()
	db0, prefix := GetDb()
	if !strings.HasSuffix(prefix, ":"+env.Name[0:1]+":") {
		t.Errorf("Test environment %q has an invalid database prefix: %q", db0, prefix)
	}
}
