// Run the full e2e matrix split across N worker processes (default: number of CPUs, max 4).
//   npm run e2e:par              # all profiles, both targets
//   npm run e2e:par -- --jobs=2 --suite=draw
// Each worker is a normal `scripts/e2e.js --profile=…` run, so results/JSON files are identical to `npm run e2e`.
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const jobsArg = args.find((a) => a.startsWith('--jobs='));
const jobs = Math.max(1, Math.min(4, jobsArg ? +jobsArg.split('=')[1] : os.cpus().length));
const rest = args.filter((a) => !a.startsWith('--jobs=') && !a.startsWith('--profile='));
const profArg = args.find((a) => a.startsWith('--profile='));
const ALL = ['ipad-pro-11-landscape', 'ipad-pro-11-portrait', 'ipad-7-landscape', 'ipad-7-portrait', 'ipad-mini-landscape', 'ipad-mini-portrait', 'iphone-14-portrait', 'iphone-14-landscape', 'desktop-chromium'];
const profiles = profArg ? profArg.split('=')[1].split(',') : ALL;
const buckets = Array.from({ length: jobs }, () => []);
profiles.forEach((p, i) => buckets[i % jobs].push(p));

const t0 = Date.now();
const results = await Promise.all(buckets.filter((b) => b.length).map((b, w) => new Promise((resolve) => {
  const proc = spawn(process.execPath, [path.join(ROOT, 'scripts/e2e.js'), `--profile=${b.join(',')}`, ...rest], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const pipe = (d) => { out += d; for (const line of String(d).split('\n')) if (line.trim()) process.stdout.write(`[w${w}] ${line}\n`); };
  proc.stdout.on('data', pipe); proc.stderr.on('data', pipe);
  proc.on('exit', (code) => {
    const m = out.match(/E2E: (\d+) runs, (\d+) checks passed, (\d+) failed/);
    resolve({ code, runs: m ? +m[1] : 0, pass: m ? +m[2] : 0, fail: m ? +m[3] : 1 });
  });
})));
const tot = results.reduce((a, r) => ({ runs: a.runs + r.runs, pass: a.pass + r.pass, fail: a.fail + r.fail + (r.code && !r.fail ? 1 : 0) }), { runs: 0, pass: 0, fail: 0 });
console.log(`\nE2E (parallel ×${jobs}): ${tot.runs} runs, ${tot.pass} checks passed, ${tot.fail} failed (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
process.exit(tot.fail ? 1 : 0);
