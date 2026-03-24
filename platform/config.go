/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package platform

import (
	"fmt"
	"os"
	"strings"

	"github.com/dotenv-org/godotenvvault"
)

type Environment struct {
	DbKeyPrefix string
	DbUrl       string
	Name        string
}

//goland:noinspection SpellCheckingInspection
var (
	loadedConfig = Environment{
		DbKeyPrefix: "c:",
		DbUrl:       "redis://",
		Name:        "CI",
	}
)

func init() {
	_ = SetConfig("d")
}

// GetConfig returns a pointer to the current Environment.
//
// The use of a pointer allows the Environment to be altered.
// This is typically done for testing purposes. Any alterations
// will be overwritten at the next SetConfig call.
//
// There is always a current environment. When this module is first loaded,
// it attempts to load a development environment via `SetConfig("d")`.
// If that fails, it falls back to a `CI` environment that has no
// secret values in it.
func GetConfig() *Environment {
	return &loadedConfig
}

// SetConfig sets the environment based on the dotenv file of the specified name.
//
// If you don't specify any name, you get the environment from the current directory's
// `.env.vault` file selected by the `DOTENV_KEY` environment variable. Only the
// current directory is searched for the `.env.vault` file (or fallback `.env` file).
//
// If you do specify a name, you are specifying that you want to the environment
// loaded from a `.env*` file. Only the first character of the name matters,
// and it must be one of 'd' (for `.env`), 's' for `.env.staging`,
// 'p' for `.env.production`, or 't' for `.env.testing`. And the file is looked
// for not only in the current directory but also four levels of parent.
func SetConfig(name string) error {
	// notest
	if name == "" {
		return setEnvConfig("")
	}
	if strings.HasPrefix(name, "d") {
		return setEnvConfig(".env")
	}
	if strings.HasPrefix(name, "s") {
		return setEnvConfig(".env.staging")
	}
	if strings.HasPrefix(name, "p") {
		return setEnvConfig(".env.production")
	}
	if strings.HasPrefix(name, "t") {
		return setEnvConfig(".env.testing")
	}
	return fmt.Errorf("unknown environment: %s", name)
}

func setEnvConfig(filename string) error {
	var d string
	var err error
	if filename == "" {
		err = godotenvvault.Overload()
	} else {
		if d, err = FindEnvFile(filename); err == nil {
			err = godotenvvault.Overload(d + filename)
		}
	}
	if err != nil {
		return fmt.Errorf("error loading environment: %w", err)
	}
	loadedConfig = Environment{
		DbKeyPrefix: os.Getenv("DB_KEY_PREFIX"),
		DbUrl:       os.Getenv("REDISCLOUD_URL"),
		Name:        os.Getenv("ENVIRONMENT_NAME"),
	}
	return nil
}

func FindEnvFile(name string) (string, error) {
	for i := range 5 {
		d := ""
		for range i {
			d += "../"
		}
		if _, err := os.Stat(d + name); err == nil {
			return d, nil
		}
	}
	return "", fmt.Errorf("no file %q found in the current directory or four levels of parent", name)
}
