import { execFileSync } from 'node:child_process';

/**
 * Kills whatever is listening on a TCP port, cross-platform.
 *
 * @param {number} port
 * @returns {void}
 */
function killProcessOnPort(port) {
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

/**
 * Kills the test-only dev server (port 3001) and test Mailpit instance (port 2526/2525).
 *
 * Always by port, never by process name/image - "mailpit.exe" also matches other local dev
 * tools' own Mailpit instances (e.g. WP Engine's Local) on this machine. See docs/e2e-test-quality.md.
 *
 * @returns {void}
 */
export default function globalTeardown() {
    killProcessOnPort(3001);
    killProcessOnPort(2526);
    killProcessOnPort(2525);
}
