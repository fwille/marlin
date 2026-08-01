# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.


# Git
Keep git commit messages concise — short subject line, no body/description unless truly necessary.

# F-Droid recipe
Before pushing any change to `metadata/com.marlinid.marlin.yml`, run `fdroid rewritemeta com.marlinid.marlin` from the repo root and commit the result. The pipeline enforces canonical YAML ordering — if you skip this step, the `fdroid rewritemeta` CI job will fail.

Never edit or programmatically round-trip this file with plain PyYAML (`import yaml; yaml.safe_load`/`safe_dump`). Its YAML-1.1 resolver reads the bare `gradle: yes` idiom as a boolean and silently corrupts it on write. Use `ruamel.yaml.YAML(typ='rt')` instead (matches what `fdroidserver` itself uses — see `scripts/release.sh`), or edit the raw text surgically.

Then read the full file and verify:
- Both build entries (versionCodes ending in 1 and 2) have the change applied symmetrically
- `CurrentVersion` and `CurrentVersionCode` are updated correctly
- `commit:` fields point to the intended SHA, not a tag name
- Each entry's `prebuild:` versionCode-stamping step uses `$$VERCODE$$` (fdroidserver's own template placeholder), not a hardcoded number that could go stale when copied to a new entry

When pushing to the fdroiddata fork (`gitlab.com/fiwille/fdroiddata`), always push to the `com.marlinid.marlin` branch — never to `master`. This fork does **not** feed the official `fdroid/fdroiddata` repo automatically except via F-Droid's own `checkupdates` bot (which watches GitHub tags directly and ignores the fork). A green fork pipeline means the recipe is buildable, not that any release is live — see ADR-0004 before assuming otherwise.