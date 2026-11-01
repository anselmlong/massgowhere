#!/bin/sh
# Vercel Ignored Build Step. Exit 0 skips the build; exit 1 builds.
# A data refresh only commits schedule JSON. Production reads that JSON at
# runtime, so deploying it again would store another full copy of the site
# (every church photo included) for no change visitors can see.
set -eu
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "no parent commit; building"
  exit 1
fi
if git diff --quiet HEAD^ HEAD -- ':!data' ':!public/data.json' ':!public/parish'; then
  echo "data-only commit; skipping the Vercel build"
  exit 0
fi
echo "source changed; building"
exit 1
