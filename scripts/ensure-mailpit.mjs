import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Downloads the Mailpit binary (SMTP catcher for reading test emails) if not already installed.

export const MAILPIT_INSTALL_DIR = join(process.cwd(), '.tools', 'mailpit');
export const MAILPIT_BINARY_PATH = join(
    MAILPIT_INSTALL_DIR,
    process.platform === 'win32' ? 'mailpit.exe' : 'mailpit',
);

/**
 * Downloads and extracts the Mailpit binary for the current platform if it isn't already
 * present. Safe to call on every run - a no-op once installed.
 *
 * @returns {Promise<string>} Absolute path to the Mailpit binary.
 */
export async function ensureMailpitInstalled() {
    if (existsSync(MAILPIT_BINARY_PATH)) return MAILPIT_BINARY_PATH;

    const PLATFORM_NAMES = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
    const ARCH_NAMES = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' };

    const platformName = PLATFORM_NAMES[process.platform];
    const archName = ARCH_NAMES[process.arch];
    if (!platformName || !archName) {
        throw new Error(
            `Unsupported platform for Mailpit auto-download: ${process.platform}/${process.arch}`,
        );
    }

    // Windows ships zip-capable tar; Linux's GNU tar only extracts tar.gz.
    const extension = process.platform === 'win32' ? 'zip' : 'tar.gz';
    const assetName = `mailpit-${platformName}-${archName}.${extension}`;
    const downloadUrl = `https://github.com/axllent/mailpit/releases/latest/download/${assetName}`;

    console.log(`Downloading Mailpit (${assetName})...`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
        throw new Error(`Failed to download Mailpit: ${response.status} ${response.statusText}`);
    }

    mkdirSync(MAILPIT_INSTALL_DIR, { recursive: true });
    const archivePath = join(MAILPIT_INSTALL_DIR, assetName);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

    // Absolute path: Git-for-Windows' GNU tar (no zip support) can shadow System32's real tar on PATH.
    const tarCommand =
        process.platform === 'win32'
            ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
            : 'tar';
    execFileSync(tarCommand, ['-xf', archivePath, '-C', MAILPIT_INSTALL_DIR]);

    if (!existsSync(MAILPIT_BINARY_PATH)) {
        const extracted = readdirSync(MAILPIT_INSTALL_DIR).join(', ');
        throw new Error(`Expected ${MAILPIT_BINARY_PATH} after extraction, found: ${extracted}`);
    }

    unlinkSync(archivePath);
    if (process.platform !== 'win32') execFileSync('chmod', ['+x', MAILPIT_BINARY_PATH]);

    console.log(`Mailpit installed at ${MAILPIT_BINARY_PATH}`);
    return MAILPIT_BINARY_PATH;
}

/**
 * Kills whatever is listening on a TCP port, cross-platform.
 *
 * Always by port, never by process name/image - "mailpit.exe" also matches other local dev
 * tools' own Mailpit instances (e.g. WP Engine's Local) on this machine. See docs/e2e-test-quality.md.
 * Duplicated from e2e/global-teardown.js (can't require() a .mjs there) - see docs/e2e-test-quality.md.
 *
 * @param {number} port
 * @returns {void}
 */
export function killProcessOnPort(port) {
    try {
        if (process.platform === 'win32') {
            const netstatOutput = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
            const pids = new Set(
                netstatOutput
                    .split('\n')
                    .map((line) => line.trim().split(/\s+/))
                    .filter(
                        (columns) =>
                            columns[0] === 'TCP' &&
                            columns[1]?.endsWith(`:${port}`) &&
                            columns[3] === 'LISTENING',
                    )
                    .map((columns) => columns[4]),
            );
            for (const pid of pids)
                execFileSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' });
        } else {
            const pids = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' }).trim();
            if (pids) execFileSync('kill', ['-9', ...pids.split('\n')]);
        }
    } catch {
        // Nothing was listening on the port - the expected common case, not a failure.
    }
}

// Runs directly (`node scripts/ensure-mailpit.mjs`) or via the pretest:e2e npm hook.
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    killProcessOnPort(3001);
    killProcessOnPort(2526);
    killProcessOnPort(2525);
    await ensureMailpitInstalled();
}
