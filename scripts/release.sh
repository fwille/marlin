#!/usr/bin/env bash
set -euo pipefail

VERSION=${1:?Usage: scripts/release.sh <version>  (e.g. 1.1.0)}

# Validate semver
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be X.Y.Z" >&2
  exit 1
fi

# Ensure we're on main and the working tree is clean
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main (currently on $BRANCH)" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes — commit or stash first" >&2
  exit 1
fi

# Read current version info
CURRENT_VERSION=$(node -p "require('./app.json').expo.version")
CURRENT_CODE=$(node -p "require('./app.json').expo.android.versionCode")
NEW_CODE=$((CURRENT_CODE + 1))

echo "→ $CURRENT_VERSION (versionCode $CURRENT_CODE) → $VERSION (versionCode $NEW_CODE)"

# Bump app.json
node -e "
const fs = require('fs');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
app.expo.version = '$VERSION';
app.expo.android.versionCode = $NEW_CODE;
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
"

# Add new build entry to the F-Droid recipe, using the tag name as commit ref
python3 - <<EOF
import yaml, copy, sys

path = 'metadata/com.marlinid.marlin.yml'
with open(path) as f:
    recipe = yaml.safe_load(f)

last = recipe['Builds'][-1]
new_build = copy.deepcopy(last)
new_build['versionName'] = '${VERSION}'
new_build['versionCode'] = ${NEW_CODE}
new_build['commit'] = 'v${VERSION}'

recipe['Builds'].append(new_build)
recipe['CurrentVersion'] = '${VERSION}'
recipe['CurrentVersionCode'] = ${NEW_CODE}

with open(path, 'w') as f:
    yaml.safe_dump(recipe, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
EOF

git add app.json metadata/com.marlinid.marlin.yml
git commit -m "chore: bump version to $VERSION"
git tag "v$VERSION"
git push origin main "v$VERSION"

echo "✓ Tagged and pushed v$VERSION"
echo "  GHA fdroid-sync will canonicalize the recipe and push to fdroiddata"
