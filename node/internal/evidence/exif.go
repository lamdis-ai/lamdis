package evidence

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"
)

// EXIF is the subset of image metadata that bears on whether an artifact is
// what it claims to be.
//
// Every field here is attacker-controlled. A provider who wants to lie can
// write any capture time and any coordinate they like. The verifier weights
// these signals; it never trusts them. What they are good for is the opposite
// case: honest phone captures carry a consistent, hard-to-fabricate-by-accident
// metadata fingerprint, and its *absence* is itself informative.
type EXIF struct {
	Present bool

	Make     string
	Model    string
	Software string

	// DateTimeOriginal is when the shutter fired, per the camera.
	DateTimeOriginal time.Time
	HasDateTime      bool

	// GPS, in decimal degrees.
	Lat, Lon float64
	HasGPS   bool

	PixelWidth, PixelHeight int

	// Warnings records structural oddities worth surfacing: metadata that is
	// present but internally inconsistent, which is more interesting than
	// metadata that is simply missing.
	Warnings []string
}

// tag ids we care about, in the main/Exif/GPS IFDs.
const (
	tagMake             = 0x010F
	tagModel            = 0x0110
	tagSoftware         = 0x0131
	tagExifIFD          = 0x8769
	tagGPSIFD           = 0x8825
	tagDateTimeOriginal = 0x9003
	tagPixelXDimension  = 0xA002
	tagPixelYDimension  = 0xA003

	tagGPSLatRef = 0x0001
	tagGPSLat    = 0x0002
	tagGPSLonRef = 0x0003
	tagGPSLon    = 0x0004
)

// ParseEXIF extracts metadata from JPEG bytes. A file with no EXIF is not an
// error — it is a finding, and the caller treats it as one.
func ParseEXIF(data []byte) (EXIF, error) {
	var e EXIF
	seg, err := findAPP1(data)
	if err != nil {
		return e, nil // no EXIF segment: absent, not malformed
	}
	if len(seg) < 8 {
		return e, fmt.Errorf("exif: segment too short")
	}

	// TIFF header: byte order, then magic 42, then offset to IFD0.
	var bo binary.ByteOrder
	switch string(seg[0:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return e, fmt.Errorf("exif: unknown byte order %q", seg[0:2])
	}
	if bo.Uint16(seg[2:4]) != 42 {
		return e, fmt.Errorf("exif: bad TIFF magic")
	}
	off := bo.Uint32(seg[4:8])
	if int(off) >= len(seg) {
		return e, fmt.Errorf("exif: IFD0 offset out of range")
	}
	e.Present = true

	var exifOff, gpsOff uint32
	walkIFD(seg, bo, off, func(tag uint16, val ifdValue) {
		switch tag {
		case tagMake:
			e.Make = val.str()
		case tagModel:
			e.Model = val.str()
		case tagSoftware:
			e.Software = val.str()
		case tagExifIFD:
			exifOff = val.uint()
		case tagGPSIFD:
			gpsOff = val.uint()
		}
	})

	if exifOff > 0 && int(exifOff) < len(seg) {
		walkIFD(seg, bo, exifOff, func(tag uint16, val ifdValue) {
			switch tag {
			case tagDateTimeOriginal:
				// EXIF timestamps carry no zone. They are local wall-clock at
				// the camera, which is exactly why a freshness check against
				// them is a weighted signal and not a proof.
				if t, err := time.Parse("2006:01:02 15:04:05", strings.TrimSpace(val.str())); err == nil {
					e.DateTimeOriginal, e.HasDateTime = t, true
				}
			case tagPixelXDimension:
				e.PixelWidth = int(val.uint())
			case tagPixelYDimension:
				e.PixelHeight = int(val.uint())
			}
		})
	}

	if gpsOff > 0 && int(gpsOff) < len(seg) {
		var latRef, lonRef string
		var lat, lon float64
		var haveLat, haveLon bool
		walkIFD(seg, bo, gpsOff, func(tag uint16, val ifdValue) {
			switch tag {
			case tagGPSLatRef:
				latRef = val.str()
			case tagGPSLonRef:
				lonRef = val.str()
			case tagGPSLat:
				lat, haveLat = val.dms()
			case tagGPSLon:
				lon, haveLon = val.dms()
			}
		})
		if haveLat && haveLon {
			if strings.HasPrefix(strings.ToUpper(latRef), "S") {
				lat = -lat
			}
			if strings.HasPrefix(strings.ToUpper(lonRef), "W") {
				lon = -lon
			}
			if math.Abs(lat) <= 90 && math.Abs(lon) <= 180 {
				e.Lat, e.Lon, e.HasGPS = lat, lon, true
			} else {
				e.Warnings = append(e.Warnings, "GPS coordinates out of range")
			}
		}
	}

	if e.Present && !e.HasDateTime {
		e.Warnings = append(e.Warnings, "EXIF present but carries no capture time")
	}
	return e, nil
}

// findAPP1 locates the Exif payload inside a JPEG's APP1 segment.
func findAPP1(d []byte) ([]byte, error) {
	if len(d) < 4 || d[0] != 0xFF || d[1] != 0xD8 {
		return nil, fmt.Errorf("not a JPEG")
	}
	for i := 2; i+4 <= len(d); {
		if d[i] != 0xFF {
			return nil, fmt.Errorf("no APP1 segment")
		}
		marker := d[i+1]
		if marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) {
			i += 2
			continue
		}
		if marker == 0xDA || marker == 0xD9 { // start of scan / end of image
			return nil, fmt.Errorf("no APP1 segment")
		}
		if i+4 > len(d) {
			return nil, fmt.Errorf("truncated segment header")
		}
		size := int(binary.BigEndian.Uint16(d[i+2 : i+4]))
		if size < 2 || i+2+size > len(d) {
			return nil, fmt.Errorf("bad segment length")
		}
		body := d[i+4 : i+2+size]
		if marker == 0xE1 && len(body) >= 6 && string(body[0:4]) == "Exif" {
			return body[6:], nil
		}
		i += 2 + size
	}
	return nil, fmt.Errorf("no APP1 segment")
}

type ifdValue struct {
	seg    []byte
	bo     binary.ByteOrder
	typ    uint16
	count  uint32
	offset uint32 // absolute into seg when the payload does not fit inline
	inline []byte
}

func (v ifdValue) bytes() []byte {
	size := typeSize(v.typ) * int(v.count)
	if size <= 4 {
		if size > len(v.inline) {
			return nil
		}
		return v.inline[:size]
	}
	if int(v.offset)+size > len(v.seg) {
		return nil
	}
	return v.seg[v.offset : int(v.offset)+size]
}

func (v ifdValue) str() string {
	return strings.TrimRight(string(v.bytes()), "\x00 ")
}

func (v ifdValue) uint() uint32 {
	b := v.bytes()
	switch v.typ {
	case 3: // SHORT
		if len(b) >= 2 {
			return uint32(v.bo.Uint16(b))
		}
	case 4, 9: // LONG, SLONG
		if len(b) >= 4 {
			return v.bo.Uint32(b)
		}
	}
	return 0
}

// dms reads a GPS coordinate stored as three rationals.
func (v ifdValue) dms() (float64, bool) {
	b := v.bytes()
	if v.typ != 5 || len(b) < 24 {
		return 0, false
	}
	part := func(i int) float64 {
		num := v.bo.Uint32(b[i*8 : i*8+4])
		den := v.bo.Uint32(b[i*8+4 : i*8+8])
		if den == 0 {
			return 0
		}
		return float64(num) / float64(den)
	}
	return part(0) + part(1)/60 + part(2)/3600, true
}

func typeSize(t uint16) int {
	switch t {
	case 1, 2, 6, 7:
		return 1
	case 3, 8:
		return 2
	case 4, 9, 11:
		return 4
	case 5, 10, 12:
		return 8
	}
	return 1
}

// walkIFD iterates one image file directory, calling fn per tag.
func walkIFD(seg []byte, bo binary.ByteOrder, off uint32, fn func(uint16, ifdValue)) {
	if int(off)+2 > len(seg) {
		return
	}
	n := int(bo.Uint16(seg[off : off+2]))
	base := int(off) + 2
	for i := 0; i < n; i++ {
		e := base + i*12
		if e+12 > len(seg) {
			return
		}
		tag := bo.Uint16(seg[e : e+2])
		fn(tag, ifdValue{
			seg: seg, bo: bo,
			typ:    bo.Uint16(seg[e+2 : e+4]),
			count:  bo.Uint32(seg[e+4 : e+8]),
			offset: bo.Uint32(seg[e+8 : e+12]),
			inline: seg[e+8 : e+12],
		})
	}
}

// Age reports how long before now the shutter fired, per the file's own claim.
func (e EXIF) Age(now time.Time) (time.Duration, bool) {
	if !e.HasDateTime {
		return 0, false
	}
	return now.Sub(e.DateTimeOriginal), true
}

// Summary renders the metadata for a human reading a verification report.
func (e EXIF) Summary() string {
	if !e.Present {
		return "no EXIF"
	}
	var parts []string
	if e.Make != "" || e.Model != "" {
		parts = append(parts, strings.TrimSpace(e.Make+" "+e.Model))
	}
	if e.HasDateTime {
		parts = append(parts, e.DateTimeOriginal.Format("2006-01-02 15:04:05"))
	}
	if e.HasGPS {
		parts = append(parts, fmt.Sprintf("%.5f,%.5f", e.Lat, e.Lon))
	}
	if len(parts) == 0 {
		return "EXIF present but empty"
	}
	return strings.Join(parts, " · ")
}
