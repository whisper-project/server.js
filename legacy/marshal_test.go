package legacy

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/go-test/deep"
)

type TimeTestStruct struct {
	UnixTime  UnixTime  `json:"unixTime"`
	MilliTime MilliTime `json:"milliTime"`
	SwiftTime SwiftTime `json:"swiftTime"`
}

func TestTimeMarshalUnmarshal(t *testing.T) {
	ts := TimeTestStruct{
		UnixTime:  UnixTime(time.Unix(1, 0)),
		MilliTime: MilliTime(time.UnixMilli(1000)),
		SwiftTime: SwiftTime(time.Unix(1, 1e6)),
	}
	b, err := json.Marshal(ts)
	if err != nil {
		t.Fatal(err)
	}
	expected := `{"unixTime":1,"milliTime":1000,"swiftTime":1.001000}`
	if string(b) != expected {
		t.Errorf("b should be %q but is %q", expected, string(b))
	}
	var ts2 TimeTestStruct
	if err := json.Unmarshal(b, &ts2); err != nil {
		t.Fatal(err)
	}
	if ts2.UnixTime != ts.UnixTime {
		t.Errorf("ts2.UnixTime should be %v but is %v", ts.UnixTime, ts2.UnixTime)
	}
	if ts2.MilliTime != ts.MilliTime {
		t.Errorf("ts2.MilliTime should be %v but is %v", ts.MilliTime, ts2.MilliTime)
	}
	if ts2.SwiftTime != ts.SwiftTime {
		time1 := time.Time(ts.SwiftTime)
		time2 := time.Time(ts2.SwiftTime)
		diff := time1.Sub(time2)
		t.Errorf("ts2.SwiftTime should be %s but it is %s (differs by %v)", time1, time2, diff)
	}
}

type JsonStringMapTestStruct struct {
	Vals JsonStringMap `json:"vals"`
}

func TestJsonStringMapMarshalUnmarshal(t *testing.T) {
	vals := JsonStringMap{"a": "b", "c": "d"}
	jsm := JsonStringMapTestStruct{Vals: vals}
	b, err := json.Marshal(jsm)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"vals":"{\"a\":\"b\",\"c\":\"d\"}"}` {
		t.Errorf("b should be %#q but is %#q", `{"vals":\"{\"a\":\"b\",\"c\":\"d\"}"}`, string(b))
	}
	var jsm2 JsonStringMapTestStruct
	if err := json.Unmarshal(b, &jsm2); err != nil {
		t.Fatal(err)
	}
	if diff := deep.Equal(jsm, jsm2); diff != nil {
		t.Errorf("jsm2.Vals should be %v but is %v: %v", vals, jsm2.Vals, diff)
	}
}

type TimeStruct struct {
	Time1 time.Time `json:"unixTime"`
	Time2 time.Time `json:"milliTime"`
	Time3 time.Time `json:"swiftTime"`
}

type MapStruct struct {
	Vals map[string]string `json:"vals"`
}

func TestWithoutCustomMarshalUnmarshal(t *testing.T) {
	ts1 := TimeTestStruct{
		UnixTime:  UnixTime(time.Unix(1, 0)),
		MilliTime: MilliTime(time.UnixMilli(1000)),
		SwiftTime: SwiftTime(time.Unix(1, 1e6)),
	}
	ts2 := TimeStruct{
		Time1: time.Unix(1, 0),
		Time2: time.UnixMilli(1000),
		Time3: time.Unix(1, 1e6),
	}
	tExpect, err := json.Marshal(ts2)
	if err != nil {
		t.Fatal(err)
	}
	ms1 := JsonStringMapTestStruct{Vals: JsonStringMap{"a": "b", "c": "d"}}
	ms2 := MapStruct{Vals: map[string]string{"a": "b", "c": "d"}}
	mExpect, err := json.Marshal(ms2)
	if err != nil {
		t.Fatal(err)
	}
	WithoutCustomMarshal(func() {
		tBytes, err := json.Marshal(ts1)
		if err != nil {
			t.Fatal(err)
		}
		if string(tBytes) != string(tExpect) {
			t.Errorf("b should be %q but is %q", string(tExpect), string(tBytes))
		}
		msBytes, err := json.Marshal(ms1)
		if err != nil {
			t.Fatal(err)
		}
		if string(msBytes) != string(mExpect) {
			t.Errorf("b should be %q but is %q", string(mExpect), string(msBytes))
		}
	})
	WithoutCustomUnmarshal(func() {
		var ts3 TimeTestStruct
		if err := json.Unmarshal(tExpect, &ts3); err != nil {
			t.Fatal(err)
		}
		if ts3 != ts1 {
			t.Errorf("ts3 should be %+v but is %+v", ts1, ts3)
		}
		var ms3 JsonStringMapTestStruct
		if err := json.Unmarshal(mExpect, &ms3); err != nil {
			t.Fatal(err)
		}
		if diff := deep.Equal(ms1, ms3); diff != nil {
			t.Errorf("ms3 should be %+v but is %+v: %v", ms1, ms3, diff)
		}
	})
}
