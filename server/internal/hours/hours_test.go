package hours

import (
	"reflect"
	"testing"
)

func TestFormatMatchesFrontend(t *testing.T) {
	// Kasus diambil dari keluaran formatHours() di admin/forms.js.
	week := Blank()
	for _, k := range []string{"mon", "tue", "wed", "thu", "fri"} {
		*week[k] = Day{Open: true, Ranges: []Range{{"08:00", "15:00"}}}
	}
	*week["sat"] = Day{Open: true, Ranges: []Range{{"08:00", "12:00"}}}
	all24 := Blank()
	for _, d := range Days {
		*all24[d.Key] = Day{Open: true, H24: true, Ranges: []Range{}}
	}
	split := Blank()
	*split["mon"] = Day{Open: true, Ranges: []Range{{"08:00", "12:00"}, {"13:00", "16:00"}}}
	*split["sun"] = Day{Open: true, H24: true, Ranges: []Range{}}
	cases := map[string]Spec{
		"Sen–Jum 08.00–15.00; Sab 08.00–12.00":     week,
		"Setiap hari 24 jam":                       all24,
		"Sen 08.00–12.00, 13.00–16.00; Min 24 jam": split,
		"Tutup": Blank(),
	}
	for want, s := range cases {
		if got := Format(s); got != want {
			t.Errorf("Format = %q, ingin %q", got, want)
		}
		if want == "Tutup" {
			continue
		}
		back, ok := Parse(want)
		if !ok || Format(back) != want {
			t.Errorf("Parse(%q) tidak bolak-balik: %q", want, Format(back))
		}
	}
}

func TestGoogleRoundTrip(t *testing.T) {
	s, _ := Parse("Sen–Jum 08.00–15.00; Sab 08.00–12.00; Min 24 jam")
	ps := ToGoogle(s)
	if len(ps) != 7 {
		t.Fatalf("periods = %d", len(ps))
	}
	if ps[6].OpenDay != "SUNDAY" || ps[6].CloseTime.Hours != 24 {
		t.Fatalf("24 jam salah: %+v", ps[6])
	}
	back := FromGoogle(ps)
	if !reflect.DeepEqual(Format(back), Format(s)) {
		t.Fatalf("round trip: %q vs %q", Format(back), Format(s))
	}
}

func TestValidate(t *testing.T) {
	s, _ := Parse("Sen 08.00–15.00")
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	*s["mon"] = Day{Open: true, Ranges: []Range{{"15:00", "08:00"}}}
	if err := s.Validate(); err == nil {
		t.Fatal("jam terbalik harus ditolak")
	}
	if err := Blank().Validate(); err == nil {
		t.Fatal("tanpa hari buka harus ditolak")
	}
}
