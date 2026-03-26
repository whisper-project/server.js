package legacy

import (
	"context"
	"log"
	"maps"
	"slices"
	"time"

	"github.com/whisper-project/whisper.server/platform"
)

// An SummarizedProfile boils down a SharedProfile to its pertinent features.
//
// The WhisperedMap is a conversationId->conversationName map of conversations that have listeners.
// The TranscriptMap is a conversationId->transcriptIds map of conversations that have transcripts.
// The ListenedMap is a conversationId->ownerId map of conversations that have been listened to.
//
// _N.B._: If all three maps are empty, then the user must be only a Whisperer who uses the
// app for voice generation purposes, so the WhisperedMap is populated with all conversations.
type SummarizedProfile struct {
	Id            string
	Name          string
	LastUsed      time.Time
	WhisperedMap  *map[string]string   `json:",omitempty"`
	TranscriptMap *map[string][]string `json:",omitempty"`
	ListenedMap   *map[string]string   `json:",omitempty"`
}

// CmpSummarizedProfiles is a comparator function for summarized profiles.
//
// It ranks them by the number of their interesting features, so those
// with the most transcripts are ranked highest, those with the most
// whispered conversations are ranked next, and those with only
// listened-to conversations are ranked last.
func CmpSummarizedProfiles(a, b SummarizedProfile) int {
	if a.TranscriptMap != nil && b.TranscriptMap != nil {
		aCount := 0
		for _, ts := range *a.TranscriptMap {
			aCount += len(ts)
		}
		bCount := 0
		for _, ts := range *b.TranscriptMap {
			bCount += len(ts)
		}
		return bCount - aCount
	} else if a.TranscriptMap != nil {
		return -1
	} else if b.TranscriptMap != nil {
		return 1
	}
	if a.WhisperedMap != nil && b.WhisperedMap != nil {
		return len(*b.WhisperedMap) - len(*a.WhisperedMap)
	} else if a.WhisperedMap != nil {
		return -1
	} else if b.WhisperedMap != nil {
		return 1
	}
	return len(*b.ListenedMap) - len(*a.ListenedMap)
}

// SummarizeProfiles takes a list of profiles and returns a list of their summaries.
//
// The returned list is sorted by the number of interesting features.
func SummarizeProfiles(profiles []SharedProfile) []SummarizedProfile {
	var results []SummarizedProfile
	for _, p := range profiles {
		s := SummarizeProfile(&p)
		if s.WhisperedMap != nil || s.ListenedMap != nil {
			results = append(results, s)
		}
	}
	slices.SortFunc(results, CmpSummarizedProfiles)
	return results
}

// SummarizeProfile takes a profile and returns its summary.
func SummarizeProfile(p *SharedProfile) SummarizedProfile {
	var s SummarizedProfile
	s.Id = p.Id
	s.Name = p.Name
	s.LastUsed = p.LastUsed
	whisperMap := make(map[string]string)
	for _, convo := range p.WhisperProfile.Table {
		if len(convo.AllowedListeners) > 0 {
			whisperMap[convo.Id] = convo.Name
		}
	}
	if len(whisperMap) > 0 {
		s.WhisperedMap = &whisperMap
		conversationIds := slices.Collect(maps.Keys(whisperMap))
		transcriptMap := FindTranscriptsForConversations(conversationIds)
		if len(transcriptMap) > 0 {
			s.TranscriptMap = &transcriptMap
		}
	}
	if len(p.ListenProfile.Table) > 0 {
		listenMap := make(map[string]string)
		for _, convo := range p.ListenProfile.Table {
			listenMap[convo.Id] = convo.Name
		}
		s.ListenedMap = &listenMap
	}
	if s.WhisperedMap == nil && s.ListenedMap == nil {
		whisperMap = make(map[string]string)
		for _, convo := range p.WhisperProfile.Table {
			whisperMap[convo.Id] = convo.Name
		}
		s.WhisperedMap = &whisperMap
	}
	return s
}

// FindTranscriptsForConversations takes a list of conversationIds and returns a map that
// maps each conversationId to the list of transcripts for that conversationId.
func FindTranscriptsForConversations(conversationIds []string) map[string][]string {
	ctx := context.Background()
	db, prefix := platform.GetDb()
	iter := db.Scan(ctx, 0, prefix+"tra:*", 20).Iterator()
	results := make(map[string][]string)
	for iter.Next(ctx) {
		key := iter.Val()
		res := db.HGetAll(ctx, key)
		if err := res.Err(); err != nil {
			log.Printf("Error getting transcript for %q: %v", key, err)
			continue
		}
		m := res.Val()
		var tm TranscriptData
		if err := tm.FromStoredMap(m); err != nil {
			log.Printf("Error parsing transcript-map %v for %q: %v", m, key, err)
			continue
		}
		if slices.Contains(conversationIds, tm.ConversationId) {
			results[tm.ConversationId] = append(results[tm.ConversationId], tm.Id)
		}
	}
	return results
}
