# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.


# Git
Keep git commit messages concise — short subject line, no body/description unless truly necessary.

# F-Droid recipe
Before pushing any change to `metadata/com.marlinid.marlin.yml`, run `fdroid rewritemeta com.marlinid.marlin` from the repo root and commit the result. The pipeline enforces canonical YAML ordering — if you skip this step, the `fdroid rewritemeta` CI job will fail.

Then read the full file and verify:
- Both build entries (versionCodes ending in 1 and 2) have the change applied symmetrically
- `CurrentVersion` and `CurrentVersionCode` are updated correctly
- `commit:` fields point to the intended SHA, not a tag name

When pushing to the fdroiddata fork (`gitlab.com/fiwille/fdroiddata`), always push to the `com.marlinid.marlin` branch — never to `master`.