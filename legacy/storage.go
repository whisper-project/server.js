package legacy

import (
	"encoding/json"
	"strconv"
	"time"
)

type SharedProfile struct {
	Id               string           `json:"id"`
	LastUsed         time.Time        `json:"lastUsed"`
	Name             string           `json:"name"`
	WhisperProfile   WhisperProfile   `json:"whisperProfile"`
	ListenProfile    ListenProfile    `json:"listenProfile"`
	SettingsProfile  SettingsProfile  `json:"settingsProfile"`
	FavoritesProfile FavoritesProfile `json:"favoritesProfile"`
}

type WhisperProfile struct {
	Id                    string                         `json:"id"`
	Table                 map[string]WhisperConversation `json:"table"`
	DefaultConversationId string                         `json:"defaultId"`
	LastId                string                         `json:"lastId"`
	Timestamp             UnixTime                       `json:"timestamp"`
}

type WhisperConversation struct {
	Id               string            `json:"id"`
	Name             string            `json:"name"`
	AllowedListeners map[string]string `json:"allowed"`
}

type ListenProfile struct {
	Id        string                        `json:"id"`
	Table     map[string]ListenConversation `json:"table"`
	Timestamp UnixTime                      `json:"timestamp"`
}

type ListenConversation struct {
	Id           string    `json:"id"`
	Name         string    `json:"name"`
	Owner        string    `json:"owner"`
	OwnerName    string    `json:"ownerName"`
	LastListened SwiftTime `json:"lastListened"`
}

//goland:noinspection SpellCheckingInspection
type SettingsProfile struct {
	Id       string        `json:"id"`
	Settings JsonStringMap `json:"settings"`
	ETag     string        `json:"eTag"`
	Version  int           `json:"version"`
}

type FavoritesProfile struct {
	Id         string              `json:"id"`
	Timestamp  UnixTime            `json:"timestamp"`
	Favorites  []Favorite          `json:"favorites"`
	GroupList  []string            `json:"groupList"`
	GroupTable map[string][]string `json:"groupTable"`
}

type Favorite struct {
	Name       string `json:"name"`
	Text       string `json:"text"`
	SpeechHash string `json:"speechHash"`
	SpeechId   string `json:"speechId"`
}

func (p *SharedProfile) FromStoredMap(m map[string]string) error {
	getString := func(key string) string {
		val, _ := m[key]
		return val
	}
	getInt64 := func(key string) int64 {
		val, _ := strconv.ParseInt(getString(key), 10, 64)
		return val
	}
	getJson := func(key string) json.RawMessage {
		return json.RawMessage(getString(key))
	}
	jStr := getJson("whisperProfile")
	var wp WhisperProfile
	err := json.Unmarshal(jStr, &wp)
	if err != nil {
		return err
	}
	jStr = getJson("listenProfile")
	var lp ListenProfile
	err = json.Unmarshal(jStr, &lp)
	if err != nil {
		return err
	}
	jStr = getJson("settingsProfile")
	var sp SettingsProfile
	err = json.Unmarshal(jStr, &sp)
	if err != nil {
		return err
	}
	jStr = getJson("favoritesProfile")
	var fp FavoritesProfile
	err = json.Unmarshal(jStr, &fp)
	if err != nil {
		return err
	}
	p.Id = getString("id")
	p.LastUsed = time.UnixMilli(getInt64("lastUsed"))
	p.Name = getString("name")
	p.WhisperProfile = wp
	p.ListenProfile = lp
	p.SettingsProfile = sp
	p.FavoritesProfile = fp
	return nil
}

type ConversationInfo struct {
	Id      string `json:"id"`
	Name    string `json:"name"`
	OwnerId string `json:"ownerId"`
}

func (ci *ConversationInfo) FromStoredMap(m map[string]string) error {
	getString := func(key string) string {
		val, _ := m[key]
		return val
	}
	ci.Id = getString("id")
	ci.Name = getString("name")
	ci.OwnerId = getString("ownerId")
	return nil
}

type TranscriptData struct {
	Id             string    `json:"id"`
	ConversationId string    `json:"conversationId"`
	TzId           string    `json:"tzId"`
	StartTime      time.Time `json:"startTime"`
	Duration       time.Time `json:"duration"`
	Transcription  string    `json:"transcription"`
}

func (td *TranscriptData) FromStoredMap(m map[string]string) error {
	getString := func(key string) string {
		val, _ := m[key]
		return val
	}
	getInt64 := func(key string) int64 {
		val, _ := strconv.ParseInt(getString(key), 10, 64)
		return val
	}
	td.Id = getString("id")
	td.ConversationId = getString("conversationId")
	td.TzId = getString("tzId")
	td.StartTime = time.UnixMilli(getInt64("startTime"))
	td.Duration = time.UnixMilli(getInt64("duration"))
	td.Transcription = getString("transcription")
	return nil
}
