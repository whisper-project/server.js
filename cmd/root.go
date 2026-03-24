/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

// Package cmd is the root of the cobra structure.
package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var (
	verbose     int
	environment string
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "whisper.server2",
	Short: "whisper.server2 is the next generation Whisper server",
	Long: `whisper.server2, the next generation Whisper server,
provides back-end services used by the next release of Whisper clients.`,
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().CountVarP(&verbose, "verbose", "v", "verbose output")
	rootCmd.PersistentFlags().StringVarP(&environment, "environment", "e", "development", "whisper environment")
}
