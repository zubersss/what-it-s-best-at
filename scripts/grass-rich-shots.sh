#!/usr/bin/env bash
# The grass's pictures (docs/briefs/grass-rich.md): the same views from a frozen build.
#   scripts/grass-rich-shots.sh <frozen dist> <suffix> [view ...]     (no view: all of them)
# One headless browser at a time; every view its own run, so one that fails does not stop the rest.
set -u
DIST="$1"; SUF="$2"; shift 2
# (the steppe: open grassland, its ground 1 461 m up; alt is over the sea)
STEPPE="lat=-54.4271&lon=39.2697&t=5&heading=120"
# (the flower meadow: see docs/briefs/grass-rich-report.md for how it was found)
MEADOW="${MEADOW:-$STEPPE}"; MEADOW_GROUND="${MEADOW_GROUND:-1461}"
declare -A Q=(
  [ledge]=""
  [steppe]="$STEPPE"
  [steppe_a30]="$STEPPE&alt=1491&pitch=-8"
  [steppe_a120]="$STEPPE&alt=1581&pitch=-14"
  [meadow]="$MEADOW"
  [meadow_a20]="$MEADOW&alt=$((MEADOW_GROUND + 20))&pitch=-10"
  [pollen]="${POLLEN:-$MEADOW}"
  [floor]="debug=floor"
  [steppe_phone]="$STEPPE&fov=21.4"
)
ORDER=(steppe ledge steppe_a30 steppe_a120 meadow meadow_a20 pollen steppe_phone floor)
[ $# -gt 0 ] && ORDER=("$@")
fail=0
for v in "${ORDER[@]}"; do
  node scripts/shots.mjs --dist --distdir "$DIST" --world haven --shot ledge --size 660x309 --dsf 1 --out docs/shots/grass-rich --query "${Q[$v]}" --suffix "_${v}${SUF}" --timeout 1800 || fail=1
  echo "VIEW-DONE $v$SUF"
done
echo "GRASS-RICH-SHOTS-DONE fail=$fail"
exit $fail
