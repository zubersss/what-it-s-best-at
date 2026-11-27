#!/bin/sh
# Every check that needs no browser, one line each, the failures at the end (exit 1 if any):
#   ./scripts/all-node-checks.sh        (five minutes; each check's own print-out is left in $TMPDIR/node-check-<name>.log)
# Run it before a push: a change to the game can break a check that stands in for the game
# (a stub of the renderer without a call the game now makes).
cd "$(dirname "$0")/.."
fail=""
run() { name="$1"; shift; if "$@" > "${TMPDIR:-/tmp}/node-check-$name.log" 2>&1; then echo "ok   $name"; else echo "FAIL $name"; fail="$fail $name"; fi; }
run build ./scripts/build-check.sh
for t in cost-plan-test far-forest-cull-test leaf-rest-test grass-blocks-test grass-place-test grass-flowers-pixels-test grass-light-test season-test sky-system-test sky-list-test sky-slots-test sky-steer-test sky-format-test sky-cell-test far-trees-test far-tree-form-test far-tree-shade-test far-ground-test shadow-fine-rocks-test shadow-axes-test terrain-bake-sun-test tree-shadow-test shadow-hash-steady-test tree-shared-corners-test hero-bind-test hero-cost rig-over-rock check-ephemeris; do [ -f scripts/$t.mjs ] && run $t node scripts/$t.mjs; done
run rocks npm run rocks
run govsim npm run govsim
run lakes npm run lakes
echo "failed:${fail:- none}"
[ -z "$fail" ]
