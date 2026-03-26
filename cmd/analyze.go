/*
 * Copyright 2024-2026 Daniel C. Brotsky. All rights reserved.
 * All the copyrighted work in this repository is licensed under the
 * GNU Affero General Public License v3, reproduced in the LICENSE file.
 */

package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/whisper-project/whisper.server/legacy"
	"github.com/whisper-project/whisper.server/platform"

	"github.com/spf13/cobra"
)

var analyzeCmd = &cobra.Command{
	Use:   "analyze",
	Args:  cobra.NoArgs,
	Short: "Analyze the data from the old server.",
	Long:  `Does whichever analysis seems needed.`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := platform.SetConfig(environment); err != nil {
			fmt.Fprintf(os.Stderr, "Can't run in environment %q: %v\n", environment, err)
			os.Exit(1)
		}
		log.SetFlags(0)
		analyzeData()
	},
}

func init() {
	rootCmd.AddCommand(analyzeCmd)
}

func downloadData() {
	fmt.Println("Downloading profiles...")
	downloadMaps("pro:")
	fmt.Println("Downloading conversations...")
	downloadMaps("con:")
	fmt.Println("Downloading transcripts...")
	downloadMaps("tra:")
}

func downloadMaps(keyPrefix string) {
	processed, failed := 0, 0
	ctx := context.Background()
	db, prefix := platform.GetDb()
	localDb := platform.GetLocalDb()
	iter := db.Scan(ctx, 0, prefix+keyPrefix+"*", 20).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		res := db.HGetAll(ctx, key)
		if err := res.Err(); err != nil {
			log.Printf("Error reading key %q: %v", key, err)
			continue
		}
		processed += 1
		if processed%100 == 0 {
			log.Printf("Processed %d keys...", processed)
		}
		m := res.Val()
		if err := localDb.HSet(ctx, key, m).Err(); err != nil {
			log.Printf("Error writing key %q: %v", key, err)
			failed += 1
		}
	}
	fmt.Printf("Processed %d items.\n", processed)
	if failed > 0 {
		log.Printf("Failed to download %d keys.", failed)
	}
}

func analyzeData() {
	profiles := loadProfiles()
	dumpProfilesToJson(profiles)
	summaries := legacy.SummarizeProfiles(profiles)
	dumpSummariesToJson(summaries)
}

func loadProfiles() []legacy.SharedProfile {
	log.Printf("Loading legacy profiles...")
	var profiles []legacy.SharedProfile
	earliest := time.Now().AddDate(0, -6, 0).UnixMilli()
	processed, ignored := 0, 0
	_ = platform.SetConfig("testing")
	db, prefix := platform.GetDb()
	iter := db.Scan(context.Background(), 0, prefix+"pro:*", 20).Iterator()
	for iter.Next(context.Background()) {
		key := iter.Val()
		res := db.HGetAll(context.Background(), key)
		if err := res.Err(); err != nil {
			log.Printf("Error reading key %q: %v", key, err)
			continue
		}
		m := res.Val()
		processed += 1
		if _, ok := m["password"]; !ok {
			ignored += 1
			continue
		}
		if _, ok := m["whisperProfile"]; !ok {
			log.Printf("Key %q has a password but no whisperProfile", key)
			ignored += 1
			continue
		}
		var p legacy.SharedProfile
		if err := p.FromStoredMap(m); err != nil {
			log.Printf("Error parsing profile from key %q: %v", key, err)
			ignored += 1
			continue
		}
		if p.LastUsed.UnixMilli() < earliest {
			ignored += 1
			continue
		}
		profiles = append(profiles, p)
	}
	log.Printf("Processed %d profiles, ignored %d, returning %d.\n", processed, ignored, len(profiles))
	return profiles
}

func dumpProfilesToJson(what []legacy.SharedProfile) {
	where := "local/legacy-shared-profiles.json"
	log.Printf("Dumping legacy profiles to %q...", where)
	legacy.WithoutCustomMarshal(func() {
		data, err := json.MarshalIndent(what, "", "  ")
		if err != nil {
			log.Printf("Error marshaling profiles to JSON: %v", err)
			return
		}
		err = os.WriteFile(where, data, 0644)
		if err != nil {
			log.Printf("Error writing profiles to %q: %v", where, err)
		}
	})
}

func dumpSummariesToJson(summaries []legacy.SummarizedProfile) {
	where := "local/summarized-shared-profiles.json"
	log.Printf("Dumping %d summarized profiles to %q...", len(summaries), where)
	legacy.WithoutCustomMarshal(func() {
		data, err := json.MarshalIndent(summaries, "", "  ")
		if err != nil {
			log.Printf("Error marshaling summaries to JSON: %v", err)
			return
		}
		err = os.WriteFile(where, data, 0644)
		if err != nil {
			log.Printf("Error writing summaries to %q: %v", where, err)
		}
	})
}
