/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"regexp"

	"github.com/whisper-project/whisper.server/platform"

	"github.com/spf13/cobra"
)

var dbCmd = &cobra.Command{
	Use:   "db",
	Short: "Manage database content",
	Long: `This utility manages database content.
You specify what you want to do with a subcommand.`,
}

func init() {
	rootCmd.AddCommand(dbCmd)
	dbCmd.AddCommand(listMatchingKeysCmd)
	dbCmd.AddCommand(deleteMatchingKeysCmd)
	dbCmd.AddCommand(deleteTestKeysCmd)
}

var listMatchingKeysCmd = &cobra.Command{
	Use: "list-matching-keys [regexp]",
	Args: func(cmd *cobra.Command, args []string) error {
		if len(args) > 1 {
			return fmt.Errorf("accepts at most 1 arg(s), received %d", len(args))
		}
		return nil
	},
	Short: "List all keys that match an (optional) regexp",
	Long: `List all the database keys that match a regular expression.
The match is done anywhere in the key and is case-sensitive;
use expression modifiers for anchoring or case insensitivity.
If no regular expression is given, all keys are listed.`,
	Run: func(cmd *cobra.Command, args []string) {
		re := ""
		if len(args) > 0 {
			re = args[0]
		}
		pat, err := regexp.Compile(re)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Invalid regular expression %q: %v\n", args[0], err)
			os.Exit(1)
		}
		if err := platform.SetConfig(environment); err != nil {
			fmt.Fprintf(os.Stderr, "Can't run in environment %q: %v\n", environment, err)
			os.Exit(1)
		}
		log.SetFlags(0)
		listMatchingKeys(pat)
	},
}

var deleteMatchingKeysCmd = &cobra.Command{
	Use:   "delete-matching-keys <regexp>",
	Args:  cobra.ExactArgs(1),
	Short: "Delete all keys that match a regexp",
	Long: `Delete all the database keys that match a regular expression.
The match is done anywhere in the key and is case-sensitive;
use expression modifiers for anchoring or case insensitivity.`,
	Run: func(cmd *cobra.Command, args []string) {
		pat, err := regexp.Compile(args[0])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Invalid regular expression %q: %v\n", args[0], err)
			os.Exit(1)
		}
		if err := platform.SetConfig(environment); err != nil {
			fmt.Fprintf(os.Stderr, "Can't run in environment %q: %v\n", environment, err)
			os.Exit(1)
		}
		log.SetFlags(0)
		deleteMatchingKeys(pat)
	},
}

var deleteTestKeysCmd = &cobra.Command{
	Use:   "delete-test-keys",
	Args:  cobra.NoArgs,
	Short: "Delete keys left from testing",
	Long:  `Delete all the keys created during test runs.`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := platform.SetConfig(environment); err != nil {
			fmt.Fprintf(os.Stderr, "Can't run in environment %q: %v\n", environment, err)
			os.Exit(1)
		}
		log.SetFlags(0)
		deleteTestKeys()
	},
}

func listMatchingKeys(pat *regexp.Regexp) {
	env := platform.GetConfig()
	log.Printf("Finding keys in %s that match %q...", env.Name, pat)
	count := mapMatchingKeys(pat, true, false)
	if count == 0 {
		log.Printf("No keys matched.")
	} else if count == 1 {
		log.Printf("1 key matched.")
	} else {
		log.Printf("%d keys matched.", count)
	}
}

func deleteMatchingKeys(pat *regexp.Regexp) {
	env := platform.GetConfig()
	log.Printf("Deleting keys in %s that match %q...", env.Name, pat)
	count := mapMatchingKeys(pat, verbose > 0, true)
	if count == 0 {
		log.Printf("No keys matched, so no keys were deleted.")
	} else if count == 1 {
		log.Printf("1 key was deleted.")
	} else {
		log.Printf("%d keys were deleted.", count)
	}
}

func deleteTestKeys() {
	env := platform.GetConfig()
	_, prefix := platform.GetDb()
	log.Printf("Deleting keys left from testing in %s...", env.Name)
	pat := regexp.MustCompile("^" + prefix + "[^:]+:test-")
	count := mapMatchingKeys(pat, verbose > 0, true)
	if count == 0 {
		log.Printf("No keys left from testing found, so no keys were deleted.")
	} else if count == 1 {
		log.Printf("1 key was deleted.")
	} else {
		log.Printf("%d keys were deleted.", count)
	}
}

func mapMatchingKeys(pat *regexp.Regexp, alsoList bool, alsoDelete bool) int {
	ctx := context.Background()
	db, prefix := platform.GetDb()
	count := 0
	iter := db.Scan(ctx, 0, prefix+"*", 20).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		if pat.MatchString(key) {
			if count == 0 && alsoList {
				log.Printf("Matching keys:")
			}
			count++
			if alsoList {
				log.Printf("    %q", key)
			}
			if alsoDelete {
				_ = db.Del(ctx, key)
			}
		}
	}
	return count
}
