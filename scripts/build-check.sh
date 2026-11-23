#!/bin/sh
# Builds the site and fails loudly if the build fails (a pipe through tail hides that).
# First: every name the scripts import from each other exists (the build checks src/ only).
node scripts/check-scripts.mjs || exit 1
out=$(npx vite build 2>&1); code=$?
echo "$out" | tail -4 | cut -c1-200
exit $code
