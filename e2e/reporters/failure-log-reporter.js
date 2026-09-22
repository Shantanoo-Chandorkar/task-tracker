import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Writes a per-run failed-test summary to test-results/runs/<timestamp>/failures.md; skipped on an all-green run.
 */
export default class FailureLogReporter {
    failures = [];

    /**
     * Records one failed test's title, location and error messages for later writing.
     *
     * @param {import('@playwright/test/reporter').TestCase} test
     * @param {import('@playwright/test/reporter').TestResult} result
     * @returns {void}
     */
    onTestEnd(test, result) {
        if (result.status !== 'failed' && result.status !== 'timedOut') return;

        this.failures.push({
            title: test.titlePath().slice(1).join(' > '),
            project: test.titlePath()[1],
            location: `${relative(process.cwd(), test.location.file)}:${test.location.line}`,
            status: result.status,
            durationMs: result.duration,
            errors: result.errors.map((error) => error.message ?? String(error)),
        });
    }

    /**
     * Writes the collected failures to a timestamped Markdown file, if any were recorded.
     *
     * @param {import('@playwright/test/reporter').FullResult} result
     * @returns {void}
     */
    onEnd(result) {
        if (this.failures.length === 0) return;

        const runDir = join(process.cwd(), 'test-results', 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
        mkdirSync(runDir, { recursive: true });

        const lines = [
            `# E2E failures`,
            ``,
            `${this.failures.length} failed, ${result.status}, run took ${(result.duration / 1000).toFixed(1)}s`,
            ``,
        ];

        for (const failure of this.failures) {
            lines.push(`## ${failure.title} [${failure.project}]`, ``, failure.location, ``);
            for (const errorMessage of failure.errors) lines.push('```', errorMessage, '```', '');
        }

        writeFileSync(join(runDir, 'failures.md'), lines.join('\n'));
    }
}
