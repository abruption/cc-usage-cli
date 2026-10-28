import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('installs the packed CLI without runtime dependencies and runs offline help/version', () => {
  const temp = mkdtempSync(join(tmpdir(), 'cc-usage-pack-'));
  try {
    const npm = process.env.npm_execpath;
    assert.ok(npm, 'run via npm run test:pack');
    const home = join(temp, 'home');
    mkdirSync(home);
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: home,
      XDG_CACHE_HOME: join(temp, 'cache'),
    };
    const runNpm = (args: string[]) => execFileSync(process.execPath, [npm, '--cache', join(temp, 'npm-cache'), ...args], {
      env, encoding: 'utf8', timeout: 60_000,
    });
    const [packed] = JSON.parse(runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp]));
    const install = join(temp, 'install');
    runNpm(['install', '--prefix', install, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--offline', join(temp, packed.filename)]);
    const pkgDir = join(install, 'node_modules', 'cc-usage-cli');
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});
    const binary = join(pkgDir, pkg.bin['cc-usage-cli']);
    const run = (flag: string) => execFileSync(process.execPath, [binary, flag], {
      env, encoding: 'utf8', timeout: 10_000,
    });
    assert.match(run('--help'), /Usage:/);
    assert.equal(run('--version').trim(), `cc-usage-cli v${pkg.version}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
