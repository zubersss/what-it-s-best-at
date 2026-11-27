#!/bin/sh
# Builds the site and fails loudly if the build fails (a pipe through tail hides that).
# First: every name the scripts import from each other exists (the build checks src/ only).
node scripts/check-scripts.mjs || exit 1
# ... and no merge has left its marks in a source file (inside a shader's text they build, and the shader fails on the device alone)
if grep -rnE '^(<<<<<<<|>>>>>>>) ' src scripts --include='*.js' --include='*.mjs' --include='*.sh'; then echo 'build-check: marks of an unfinished merge in the files above'; exit 1; fi
out=$(npx vite build 2>&1); code=$?
echo "$out" | tail -4 | cut -c1-200
exit $code
