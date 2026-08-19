#!/usr/bin/env node
/**
 * `npm audit` gate with a scoped allowlist.
 *
 * npm has no native way to ignore a single advisory (unlike yarn/pnpm), so one
 * advisory with no published fix would keep CI red indefinitely — and because the
 * audit step gates the rest of the workflow, that also hides whether the app
 * actually builds. This runs the same audit, drops explicitly allowlisted
 * advisories, and still fails on anything else at or above THRESHOLD, so genuine
 * new findings break the build.
 *
 * Run: npm run audit
 */

import { execFileSync } from 'node:child_process';

const THRESHOLD = ['high', 'critical'];

/**
 * Every entry needs a reason and a condition for removing it again. Entries are
 * not permanent: the script fails if an allowlisted advisory no longer shows up,
 * so stale suppressions can't quietly accumulate.
 */
const ALLOWLIST = [
  {
    id: 'GHSA-w3rx-r6r6-pgpr',
    package: 'image-size',
    reason:
      'No patched version exists — the advisory covers <=2.0.2 and 2.0.2 is the ' +
      'latest published release. Reached only via expo > @expo/metro > metro, ' +
      'which reads dimensions of our own committed image assets at bundle time; ' +
      'metro is a build tool and is not shipped inside the APK.',
    removeWhen: 'image-size publishes a release >2.0.2 and metro picks it up.',
  },
  {
    id: 'GHSA-5p2g-fcmc-qvqq',
    package: 'image-size',
    reason: 'Same package, same unpatched range and same build-time-only reachability as GHSA-w3rx-r6r6-pgpr.',
    removeWhen: 'image-size publishes a release >2.0.2 and metro picks it up.',
  },
];

function runAudit() {
  try {
    // npm audit exits non-zero whenever it finds anything, so a thrown error is
    // expected here — the JSON report is still on stdout.
    return execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(runAudit());
const allowed = new Map(ALLOWLIST.map((e) => [e.id, e]));

// Collect distinct advisories. npm repeats each one across every package that
// transitively depends on it, so dedupe by advisory id.
const found = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !via.url) continue;
    const id = via.url.split('/').pop();
    if (!found.has(id)) {
      found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url });
    }
  }
}

const blocking = [...found.values()].filter((a) => THRESHOLD.includes(a.severity) && !allowed.has(a.id));
const suppressed = [...found.values()].filter((a) => allowed.has(a.id));
const stale = ALLOWLIST.filter((e) => !found.has(e.id));

for (const a of suppressed) {
  console.log(`allowlisted  ${a.severity.padEnd(8)} ${a.package} — ${a.id}`);
  console.log(`             ${allowed.get(a.id).reason}`);
}

if (stale.length) {
  console.error('\nAllowlist entries no longer reported — remove them from scripts/audit-check.mjs:');
  for (const e of stale) console.error(`  ${e.id} (${e.package}) — ${e.removeWhen}`);
  process.exit(1);
}

if (blocking.length) {
  console.error(`\n${blocking.length} advisory/advisories at or above ${THRESHOLD.join('/')}:`);
  for (const a of blocking) console.error(`  ${a.severity.padEnd(8)} ${a.package} — ${a.title}\n           ${a.url}`);
  console.error('\nFix them, or add a justified entry to ALLOWLIST in scripts/audit-check.mjs.');
  process.exit(1);
}

const { moderate = 0, low = 0 } = report.metadata?.vulnerabilities ?? {};
console.log(`\nNo unallowlisted ${THRESHOLD.join('/')} advisories. (${moderate} moderate, ${low} low below the gate.)`);
