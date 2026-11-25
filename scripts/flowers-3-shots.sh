#!/usr/bin/env bash
# The flowers' pictures (docs/briefs/flowers-3.md): the same views from a frozen build.
#   scripts/flowers-3-shots.sh <frozen dist> <suffix> [view ...]     (no view: all of them)
# One headless browser at a time; every view its own run, so one that fails does not stop the rest.
set -u
DIST="$1"; SUF="$2"; shift 2
# (the flower meadow of the grass report, its ground some 1 468 m up; alt is over the sea)
MEADOW="lat=-54.39501&lon=38.28479&t=5&heading=45"
declare -A Q=(
  [ledge]=""
  [ledge_phone]="fov=21.4"
  [meadow]="$MEADOW"
  [meadow_a20]="$MEADOW&alt=1488&pitch=-10"
  [region_300]="alt=1813&pitch=-60"
  [region_1k]="alt=2513&pitch=-60"
  [floor]="debug=floor"
  [steppe]="lat=-54.4271&lon=39.2697&t=5&heading=120"
  [pollen]="lat=-54.39501&lon=38.28479&t=0&heading=72&pitch=3"
  [meadow_300]="$MEADOW&alt=1768&pitch=-60"
  [meadow_1k]="$MEADOW&alt=2468&pitch=-60"
)
ORDER=(ledge region_300 region_1k meadow_300 meadow_1k meadow_a20 meadow ledge_phone floor)
[ $# -gt 0 ] && ORDER=("$@")
fail=0
for v in "${ORDER[@]}"; do
  node scripts/shots.mjs --dist --distdir "$DIST" --world haven --shot ledge --size 660x309 --dsf 1 --out docs/shots/flowers-3 --query "${Q[$v]}" --suffix "_${v}${SUF}" --timeout 1800 || fail=1
  echo "VIEW-DONE $v$SUF"
done
echo "FLOWERS-3-SHOTS-DONE fail=$fail"
exit $fail
