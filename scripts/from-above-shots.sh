#!/usr/bin/env bash
# Haven from above (docs/briefs/from-above.md): the same views from a frozen build.
#   scripts/from-above-shots.sh <frozen dist> <suffix> [view ...]     (no view: all of them)
# A view's name: <place>_<metres over the ground>_p<degrees looked down>[_phone|_floor|_clear|_clear-phone ...].
# DEBUG=<switch> adds a debug switch to every view.
# One headless browser at a time; every view its own run, so one that fails does not stop
# the rest; a line per view in the log, so a run cut off is picked up with the views left.
set -u
DIST="$1"; SUF="$2"; shift 2
# (alt is metres over the sea: the ground is 1 513 m at the opening place, 1 190 m at the
# north wood, 1 461 m on the steppe)
declare -A PLACE=( [ledge]="" [wood]="lat=22.983&lon=129.507&" [steppe]="lat=-54.4271&lon=39.2697&t=5&" )
declare -A GROUND=( [ledge]=1513 [wood]=1190 [steppe]=1461 )
ALL=()
for h in 1000 300 3000 100; do for p in 20 60; do ALL+=("ledge_${h}_p${p}"); done; done
for pl in wood steppe; do for h in 300 1000 3000; do for p in 20 60; do ALL+=("${pl}_${h}_p${p}"); done; done; done
for h in 10000 30000 100000; do for p in 20 60; do ALL+=("ledge_${h}_p${p}"); done; done
ALL+=(ledge_300_p20_phone ledge_1000_p20_phone ledge_3000_p60_phone wood_1000_p60_phone)
ALL+=(ledge_300_p20_floor ledge_300_p60_floor ledge_3000_p20_floor ledge_3000_p60_floor)
[ $# -gt 0 ] && ALL=("$@")
fail=0
for v in "${ALL[@]}"; do
  IFS=_ read -r pl h p extra <<< "$v"
  q="${PLACE[$pl]}alt=$(( ${GROUND[$pl]} + h ))&pitch=-${p#p}"
  dbg="${DEBUG:-}"
  case "${extra:-}" in *phone*) q="$q&fov=21.4";; esac                 # (a phone's density: 309 px across 21.4 degrees is 1 440 px across 60)
  case "${extra:-}" in *floor*) dbg="${dbg:+$dbg,}floor";; esac        # (every saving of the governor on)
  case "${extra:-}" in *clear*) dbg="${dbg:+$dbg,}noclouds";; esac     # (a clear sky: from 3 km up the opening place is in or over cloud)
  [ -n "$dbg" ] && q="$q&debug=$dbg"
  node scripts/shots.mjs --dist --distdir "$DIST" --world haven --shot ledge --size 660x309 --dsf 1 --out docs/shots/from-above --query "$q" --suffix "_${v}${SUF}" --timeout 1500 || { fail=1; echo "VIEW-FAILED $v"; }
  echo "VIEW-DONE $v"
done
echo "FROM-ABOVE-SHOTS-DONE fail=$fail"
exit $fail
