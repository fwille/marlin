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

# fdroidserver is needed to canonicalize the recipe at the end, and its
# ruamel.yaml dependency backs scripts/vercodes.py just below.
command -v fdroid >/dev/null 2>&1 || pip install fdroidserver --quiet

# Release notes are looked up by the versionCode of the *published APK*, not by
# app.json's versionCode. VercodeOperation derives one APK versionCode per ABI
# (11 -> 111, 112), and fdroidserver's update.py matches a changelog file against
# each Build entry's versionCode (plus CurrentVersionCode) — so a file named after
# app.json's code matches nothing and the F-Droid client shows no "What's New".
# That is exactly what happened from 1.1.3 (when the ABI split introduced
# VercodeOperation) through 1.2.2. Write the same notes under every derived code.
mapfile -t NEW_VERCODES < <(python3 scripts/vercodes.py "$NEW_CODE")
if [[ ${#NEW_VERCODES[@]} -eq 0 ]]; then
  echo "Error: could not derive versionCodes from the recipe's VercodeOperation" >&2
  exit 1
fi

CHANGELOGS=()
for VC in "${NEW_VERCODES[@]}"; do
  CHANGELOGS+=("metadata/en-US/changelogs/${VC}.txt")
done
# The highest derived code becomes CurrentVersionCode, so treat it as the source
# of truth and fan it out to the others once its content is settled.
CHANGELOG=${CHANGELOGS[-1]}

# Transitional: earlier releases documented the app.json-code filename. If notes
# were hand-written under that name, adopt them rather than silently ignoring them.
LEGACY_CHANGELOG="metadata/en-US/changelogs/${NEW_CODE}.txt"
if [[ -s "$LEGACY_CHANGELOG" && ! -s "$CHANGELOG" ]]; then
  echo "→ Adopting hand-written $LEGACY_CHANGELOG (F-Droid keys notes by APK versionCode)"
  cp "$LEGACY_CHANGELOG" "$CHANGELOG"
  rm "$LEGACY_CHANGELOG"
fi

# Generate release notes if not already written
if [[ ! -f "$CHANGELOG" ]] || [[ ! -s "$CHANGELOG" ]]; then
  echo "→ Generating release notes…"
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [[ -n "$LAST_TAG" ]]; then
    GIT_LOG=$(git log "${LAST_TAG}..HEAD" --oneline --no-merges)
  else
    GIT_LOG=$(git log --oneline --no-merges | head -20)
  fi
  PROMPT="Write 1-3 sentences of plain English release notes for the Marlin app (a marine species identification and life-list app for Android). Based on these git commits:

${GIT_LOG}

Rules:
- Focus only on user-visible changes (new features, bug fixes the user would notice)
- Ignore: docs, CI, F-Droid recipe changes, tests, tooling, dependency updates
- If there are no user-facing changes write exactly: Internal improvements. No user-facing changes.
- Plain text only — no markdown, no bullet points, no lists
- Maximum 500 characters
- Output only the release notes text, nothing else"

  NOTES=$(npx --yes @anthropic-ai/claude-code -p "$PROMPT" 2>/dev/null)
  if [[ -z "$NOTES" ]]; then
    echo "Error: failed to generate release notes — create $CHANGELOG manually and re-run" >&2
    exit 1
  fi
  printf '%s' "$NOTES" > "$CHANGELOG"
  echo ""
  echo "Generated release notes:"
  echo "────────────────────────"
  cat "$CHANGELOG"
  echo ""
  echo "────────────────────────"
  read -r -p "Edit before continuing? [y/N] " EDIT
  if [[ "$EDIT" =~ ^[Yy]$ ]]; then
    ${EDITOR:-nano} "$CHANGELOG"
  fi
fi

# Every published ABI needs its own copy — F-Droid resolves notes per versionCode,
# so without this the armeabi-v7a APK would show no release notes.
for CL in "${CHANGELOGS[@]}"; do
  [[ "$CL" == "$CHANGELOG" ]] || cp "$CHANGELOG" "$CL"
done

echo "→ $CURRENT_VERSION (versionCode $CURRENT_CODE) → $VERSION (versionCode $NEW_CODE)"
echo "  release notes: ${CHANGELOGS[*]}"

# Bump app.json
node -e "
const fs = require('fs');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
app.expo.version = '$VERSION';
app.expo.android.versionCode = $NEW_CODE;
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
"

# Keep android/app/build.gradle in sync so F-Droid checkupdates can read the version
sed -i -E "s/versionCode [0-9]+/versionCode $NEW_CODE/" android/app/build.gradle
sed -i -E "s/versionName \"[^\"]+\"/versionName \"$VERSION\"/" android/app/build.gradle

# Commit app code first so we have the SHA to embed in the recipe
git add app.json "${CHANGELOGS[@]}" android/app/build.gradle
git commit -m "chore: bump version to $VERSION"
COMMIT_SHA=$(git rev-parse HEAD)

# Tag this commit now, not after the recipe commit that follows. F-Droid's
# checkupdates bot resolves `commit:` for new entries from wherever the
# matching git tag actually points (UpdateCheckMode: Tags v(.+)) — if the tag
# landed on the later recipe commit instead, our own commit: (captured above)
# would permanently mismatch the bot's, and every future release's entries
# would get spuriously rebuilt on the fdroiddata fork (they looked "changed"
# relative to upstream even though nothing in them actually differed).
git tag "v$VERSION"

# Add new build entries to the F-Droid recipe — one per VercodeOperation entry,
# copying the matching entry from the previous version. Uses the commit SHA (not
# the tag name) so the reference is immutable.
#
# Uses ruamel.yaml in round-trip mode (YAML 1.2), not PyYAML (YAML 1.1+), because
# the recipe's `gradle: [yes]` is F-Droid's documented "no flavors" idiom — it
# only works if the loaded value is the *string* 'yes'. PyYAML's YAML-1.1 resolver
# treats bare `yes` as a boolean, so a load/dump round-trip through it silently
# rewrites `gradle: [yes]` into `gradle: [true]`, which fdroidserver's own build
# code then reads as flavor "True" and runs the nonexistent `assembleTrueRelease`
# gradle task — breaking every build entry in the file, not just the new one.
python3 - <<EOF
import copy, sys
import ruamel.yaml

sys.path.insert(0, 'scripts')
from vercodes import apply as vcode  # shares the VercodeOperation arithmetic with the changelog step

path = 'metadata/com.marlinid.marlin.yml'
yaml = ruamel.yaml.YAML(typ='rt')
yaml.preserve_quotes = True
with open(path) as f:
    recipe = yaml.load(f)

operations = recipe.get('VercodeOperation', ['%c'])
current_code = ${CURRENT_CODE}
new_code = ${NEW_CODE}

# Find build entries for the current version by matching their versionCodes
current_vcodes = [vcode(op, current_code) for op in operations]
current_entries = [b for b in recipe['Builds'] if b['versionCode'] in current_vcodes]
if not current_entries:
    current_entries = recipe['Builds'][-len(operations):]

for op, entry in zip(operations, current_entries):
    new_entry = copy.deepcopy(entry)
    new_entry['versionName'] = '${VERSION}'
    new_entry['versionCode'] = vcode(op, new_code)
    new_entry['commit'] = '${COMMIT_SHA}'
    # prebuild's versionCode sed already uses fdroidserver's own VERCODE
    # template placeholder (substituted at build time from this entry's
    # versionCode field), so no text-rewriting is needed here.
    # NB: this heredoc is unquoted so the shell expands VERSION/COMMIT_SHA
    # below — keep backticks and dollar signs out of it or they get evaluated.
    recipe['Builds'].append(new_entry)

recipe['CurrentVersion'] = '${VERSION}'
recipe['CurrentVersionCode'] = max(vcode(op, new_code) for op in operations)

with open(path, 'w') as f:
    yaml.dump(recipe, f)
EOF

# Canonicalize before committing — the fdroid-sync GHA workflow does this
# right before pushing to fdroiddata, so if we skip it here the GitHub copy
# silently drifts out of canonical format until the next tag push.
fdroid rewritemeta com.marlinid.marlin

git add metadata/com.marlinid.marlin.yml
git commit -m "chore: update F-Droid recipe for $VERSION"
git push origin main "v$VERSION"

echo "✓ Tagged and pushed v$VERSION"
echo "  GHA fdroid-sync will canonicalize the recipe and push to fdroiddata"
