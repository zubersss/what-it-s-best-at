#!/bin/bash
# The ground's cost proxy on a copy of the tree, so that edits made while it runs (an hour
# for all ten views) cannot reload its page:   scripts/ground-cost-run.sh <scratch dir> [ground-cost options ...]
# The copy is <scratch dir>/snap (source and scripts; public/ and node_modules/ are linked).
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"; snap="$1/snap"; shift
rm -rf "$snap"; mkdir -p "$snap"
cp -r "$here/src" "$here/scripts" "$here/index.html" "$here/vite.config.js" "$here/package.json" "$snap/"
ln -s "$here/public" "$snap/public"; ln -s "$here/node_modules" "$snap/node_modules"
cd "$snap" && exec node scripts/ground-cost.mjs "$@"
