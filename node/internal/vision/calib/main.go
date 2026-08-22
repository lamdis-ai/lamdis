package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// Scores images with the real describer, to find out whether
// synthetic_suspicion discriminates at all.
//
// The threshold in verify/signals.go is 0.6 and was never measured. Wiring a
// signal on a guessed number gives either a gate that never fires or one that
// refuses honest workers with cheap cameras; which of those you get is not
// knowable from the code.
func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: calib <image>...")
		os.Exit(2)
	}
	m := vision.NewBedrock(os.Getenv("AWS_PROFILE"), os.Getenv("AWS_REGION"), "")
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	type row struct {
		name      string
		synth     float64
		recapture float64
		instr     bool
		scene     string
		err       error
	}
	var rows []row
	for _, p := range os.Args[1:] {
		data, err := os.ReadFile(p)
		if err != nil {
			rows = append(rows, row{name: filepath.Base(p), err: err})
			continue
		}
		obs, _, err := m.Describe(ctx, data)
		if err != nil {
			rows = append(rows, row{name: filepath.Base(p), err: err})
			continue
		}
		scene := obs.Scene
		if len(scene) > 58 {
			scene = scene[:58] + "…"
		}
		rows = append(rows, row{
			name:  filepath.Base(p),
			synth: obs.SyntheticSuspicion,
			scene: scene,
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].synth > rows[j].synth })

	fmt.Printf("\n%-34s %-8s  %s\n", "image", "synth", "scene")
	fmt.Println("  " + fmt.Sprintf("%s", "───────────────────────────────────────────────────────────────────"))
	for _, r := range rows {
		if r.err != nil {
			fmt.Printf("%-34s  ERROR  %v\n", r.name, r.err)
			continue
		}
		fmt.Printf("%-34s %-8.2f  %s\n", r.name, r.synth, r.scene)
	}
}
