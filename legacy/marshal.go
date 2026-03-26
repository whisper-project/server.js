package legacy

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

var (
	// CustomMarshal determines whether to use custom marshaling for legacy types.
	CustomMarshal = true
	// CustomUnmarshal determines whether to use custom unmarshaling for legacy types.
	CustomUnmarshal = true
)

func WithoutCustomMarshal(f func()) {
	CustomMarshal = false
	defer func() { CustomMarshal = true }()
	f()
}

func WithoutCustomUnmarshal(f func()) {
	CustomUnmarshal = false
	defer func() { CustomUnmarshal = true }()
	f()
}

// A UnixTime field is a time.Time that can be marshaled as an epoch timestamp.
type UnixTime time.Time

func (ut UnixTime) MarshalJSON() ([]byte, error) {
	if CustomMarshal {
		return []byte(fmt.Sprintf("%d", time.Time(ut).Unix())), nil
	}
	return json.Marshal(time.Time(ut))
}

func (ut *UnixTime) UnmarshalJSON(data []byte) error {
	if CustomUnmarshal {
		var secs int64
		if err := json.Unmarshal(data, &secs); err != nil {
			return err
		}
		*ut = UnixTime(time.Unix(secs, 0))
		return nil
	}
	var t time.Time
	if err := json.Unmarshal(data, &t); err != nil {
		return err
	}
	*ut = UnixTime(t)
	return nil
}

// A MilliTime field is a time.Time that can be marshaled as an epoch timestamp.
type MilliTime time.Time

func (mt MilliTime) MarshalJSON() ([]byte, error) {
	if CustomMarshal {
		return []byte(fmt.Sprintf("%d", time.Time(mt).UnixMilli())), nil
	}
	return json.Marshal(time.Time(mt))
}

func (mt *MilliTime) UnmarshalJSON(data []byte) error {
	if CustomUnmarshal {
		var msecs int64
		if err := json.Unmarshal(data, &msecs); err != nil {
			return err
		}
		*mt = MilliTime(time.UnixMilli(msecs))
		return nil
	}
	var t time.Time
	if err := json.Unmarshal(data, &t); err != nil {
		return err
	}
	*mt = MilliTime(t)
	return nil
}

// A SwiftTime field is a time.Time that can be marshaled as a Swift "duration since epoch".
//
// Swift seems to use 6 decimal places of precision for these durations.
type SwiftTime time.Time

func (st SwiftTime) MarshalJSON() ([]byte, error) {
	if CustomMarshal {
		d := time.Time(st).Sub(time.Unix(0, 0)).Seconds()
		return []byte(fmt.Sprintf("%.6f", d)), nil
	}
	return json.Marshal(time.Time(st))
}

func (st *SwiftTime) UnmarshalJSON(data []byte) error {
	if CustomUnmarshal {
		var d float64
		if err := json.Unmarshal(data, &d); err != nil {
			return err
		}
		secs, nanos := math.Modf(d)
		*st = SwiftTime(time.Unix(int64(secs), int64(math.Round(nanos*1e9))))
		return nil
	}
	var t time.Time
	if err := json.Unmarshal(data, &t); err != nil {
		return err
	}
	*st = SwiftTime(t)
	return nil
}

// A JsonStringMap is a JSON string-to-string map wrapped as a quoted string.
type JsonStringMap map[string]string

// MarshalJSON does a double-encoding of the map to a JSON string.
func (jsm JsonStringMap) MarshalJSON() ([]byte, error) {
	mapData, err := json.Marshal(map[string]string(jsm))
	if err != nil {
		return nil, err
	}
	if CustomMarshal {
		mapData, err = json.Marshal(string(mapData))
		if err != nil {
			return nil, err
		}
	}
	return mapData, nil
}

// UnmarshalJSON does a double-decoding of the JSON string to a map.
func (jsm *JsonStringMap) UnmarshalJSON(data []byte) error {
	if CustomUnmarshal {
		var str string
		if err := json.Unmarshal(data, &str); err != nil {
			return err
		}
		data = []byte(str)
	}
	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	*jsm = m
	return nil
}
