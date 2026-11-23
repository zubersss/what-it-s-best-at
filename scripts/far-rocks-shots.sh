#!/usr/bin/env bash
# The far rocks' pictures (docs/briefs/far-rocks.md): the same views from a frozen build.
#   scripts/far-rocks-shots.sh <frozen dist> <suffix> [view ...]     (no view: all of them)
# One headless browser at a time; every view its own run, so one that fails does not stop the rest.
set -u
DIST="$1"; SUF="$2"; shift 2
# (the steep place: its ground is 1 953 m up, the steppe's 1 461 m; alt is over the sea)
STEEP="lat=-48.80660&lon=47.22265&t=3"
STEPPE="lat=-54.4271&lon=39.2697&t=5&heading=120"
declare -A Q=(
  [ledge]="" [wall]=""
  [steep_air100]="$STEEP&alt=2053&heading=135&pitch=-14"
  [steep_air400]="$STEEP&alt=2353&heading=135&pitch=-28"
  [steep_ground]="$STEEP&heading=80&pitch=2"
  [steppe_air30]="$STEPPE&alt=1491&pitch=-8"
  [steppe_ground]="$STEPPE"
  [tele]="$STEEP&alt=2053&heading=62&pitch=-3&fov=14"
  [ledge_phone]="fov=21.4"          # (the opening view at a phone's density: 309 px across 21.4 degrees is 1 440 px across 60)
  [floor]="$STEEP&alt=2053&heading=135&pitch=-14&debug=floor"
)
ORDER=(wall ledge_phone steep_ground steppe_ground ledge steep_air100 steep_air400 tele floor steppe_air30)
[ $# -gt 0 ] && ORDER=("$@")
fail=0
for v in "${ORDER[@]}"; do
  shot=ledge; [ "$v" = wall ] && shot=wall
  node scripts/shots.mjs --dist --distdir "$DIST" --world haven --shot $shot --size 660x309 --dsf 1 --out docs/shots/far-rocks --query "${Q[$v]}" --suffix "_${v}${SUF}" --timeout 1800 || fail=1
done
echo "FAR-ROCKS-SHOTS-DONE fail=$fail"
exit $fail
