# ADR-0004: F-Droid recipe follows the upstream-proven template exactly

**Status:** Accepted

## Context

`metadata/com.marlinid.marlin.yml` is developed in this repo and mirrored to a personal GitLab fork (`fiwille/fdroiddata`) for pre-flight testing, via the `fdroid-sync` GHA workflow (on tag push) and manual pushes for out-of-band fixes (per AGENTS.md).

Between the 1.1.4 and 1.2.1 releases, the fork's recipe evolved independently into a materially different build strategy than the one actually merged and running on F-Droid's real infrastructure: it patched the repo's *committed* `android/` tree directly (`subdir: android/app`, no `expo prebuild`), rather than running `npx expo prebuild --no-install` fresh at build time like the original submission did. This drift went unnoticed because `fdroid-sync` only fires on tag pushes, and the documented manual-sync step for interim fixes was not consistently followed — so the fork silently diverged for about six weeks.

This caused three concrete bugs discovered while investigating a failed fork pipeline for 1.2.1:
1. `release.sh`'s recipe-editing step round-tripped the whole file through PyYAML (YAML 1.1), silently turning the `gradle: [yes]` "no flavors" idiom into a boolean, then into the wrong string `'true'` after `fdroid rewritemeta` re-quoted it — breaking the actual Gradle invocation for every build entry.
2. The same step copied a template entry's `prebuild` steps verbatim, including a hardcoded `sed ... versionCode 81` — never updating it for the new entry, so 1.2.1 briefly stamped the *previous* release's versionCode into `build.gradle`.
3. Entries 71/72 (v1.1.4) were pinned to a commit that predated a necessary NDK-propagation fix, permanently failing with `CXX1104` on the fork's own pipeline — while F-Droid's real build farm had, unknown to us, been using a different (correct) commit for the same entries the whole time.

Investigating this also surfaced that **the personal fork does not feed the official `fdroid/fdroiddata` repo at all.** F-Droid's own `checkupdates` bot (`AutoUpdateMode: Version` + `UpdateCheckMode: Tags v(.+)`) watches this repo's GitHub tags directly and auto-generates new Build entries on the *official* repo by templating from whatever is already merged there — independent of anything pushed to the fork. The 1.2.0 update happened this way, fully automated, with no merge request. The fork is purely a local pre-flight sandbox; getting a change live on F-Droid requires either the bot's automatic pickup or an explicitly opened and merged MR into `fdroid/fdroiddata`.

The official repo's simpler, prebuild-at-build-time template has successfully built and published versionCodes 71/72/81/82 (confirmed via the public F-Droid API) despite including the same native modules (including the custom `modules/native-location`, present since before v1.1.4) that the fork's alternate strategy was ostensibly built to support.

## Decision

The recipe adopts the exact template already proven live on F-Droid's real infrastructure, rather than maintaining a parallel, more "modern-looking" build strategy that had never actually been validated in production:

- `prebuild:` runs `npx expo prebuild --no-install --platform android` fresh (no `--clean`, so committed `android/` customizations survive the merge), instead of patching the committed `android/app/build.gradle` directly.
- `gradleprops: [reactNativeArchitectures=<abi>]` for the per-ABI split (this was already the documented recommendation in CLAUDE.md; the fork had drifted to an `echo >> gradle.properties` workaround instead).
- `sed -i -E 's/versionCode .*/versionCode $$VERCODE$$/' android/app/build.gradle` — `$$VERCODE$$` is a real fdroidserver template placeholder (`common.py`: `cmd.replace('$$VERCODE$$', str(build.versionCode))`), substituted per build entry automatically. This permanently eliminates the "forgot to update the copied hardcoded versionCode" bug class, not just for this release.
- `release.sh`'s recipe-editing step uses `ruamel.yaml` (YAML 1.2 resolver) instead of PyYAML, matching what `fdroidserver` itself uses, so `gradle: [yes]` round-trips correctly. It also no longer needs versionCode-token-rewriting logic, since `$$VERCODE$$` makes that unnecessary.

`android/` is still committed to the repo — that remains necessary so F-Droid's `checkupdates` step and `scripts/release.sh` can read/bump `versionCode`/`versionName` without running prebuild first. What changed is only that the *build* step no longer assumes the committed tree is sufficient on its own; it re-derives from a fresh `expo prebuild` pass, same as upstream.

## Consequences

- The fork's test pipeline now validates the same recipe shape that's actually live, so a green fork pipeline is meaningfully predictive of a real F-Droid build succeeding.
- Future releases via `scripts/release.sh` inherit this template automatically (it clones the previous entry), including the `$$VERCODE$$` placeholder — no recipe-specific script logic needed per release.
- The manual "push interim recipe fixes to the fork via SSH between releases" step (AGENTS.md) remains necessary to prevent this exact kind of silent divergence recurring — it was skipped for ~6 weeks leading into this incident.
- Getting a release actually live still requires either F-Droid's `checkupdates` bot to pick up the new tag on its own schedule (as it did for 1.2.0, with no human action), or manually opening and merging an MR from the fork into `fdroid/fdroiddata` if faster turnaround is wanted. A green fork pipeline is a pre-check, not a publish step.
