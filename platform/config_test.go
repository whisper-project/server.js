/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package platform

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"testing"
)

func TestGetConfig(t *testing.T) {
	name := GetConfig().Name
	fmt.Printf("Loaded configuration is %q\n", name)
	known := []string{"CI", "development", "testing", "staging", "production"}
	if !slices.Contains(known, name) {
		t.Errorf("Initial configuration %q is not a known environment", name)
	}
}

func TestFindEnvFile(t *testing.T) {
	if _, err := FindEnvFile(".env.no-such-environment-file"); err == nil {
		t.Errorf("Didn't err when the env file didn't exist in a parent directory")
	}
	if d, err := FindEnvFile(".env.vault"); err != nil {
		t.Errorf("Didn't find .env.vault in a parent directory")
	} else {
		if _, err := os.Stat(path.Join(d, "go.mod")); err != nil {
			p, _ := filepath.Abs(d)
			t.Errorf("Found .env.vault in a parent that doesn't have a 'go.mod' file: %s", p)
		}
	}
}

func TestSetVaultConfig(t *testing.T) {
	t.Skip("There is no vault environment to test with.")
	d, err := FindEnvFile(".env.vault")
	if err != nil {
		t.Fatalf("Failed to find .env.vault in a parent directory")
	}
	curdir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get the current working directory")
	}
	env := *GetConfig()
	defer func() { loadedConfig = env }()
	if err := os.Chdir(d); err != nil {
		t.Fatalf("Failed to chdir into the parent directory")
	}
	if err := SetConfig(""); err != nil {
		t.Errorf("Failed to load vault environment")
	}
	if err := os.Chdir(curdir); err != nil {
		t.Fatalf("Failed to return to the original working directory")
	}
}
