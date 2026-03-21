#!/bin/sh
set -eu

node -e "const fs=require('fs'); const value=process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ''; fs.writeFileSync('/app/public/runtime-config.js', 'window.__APP_RUNTIME_CONFIG__ = ' + JSON.stringify({ API_BASE_URL: value }, null, 2) + ';\\n');"

exec "$@"
