#!/bin/sh
# Builds the site and fails loudly if the build fails (a pipe through tail hides that).
out=$(npx vite build 2>&1); code=$?
echo "$out" | tail -4 | cut -c1-200
exit $code
