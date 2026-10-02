import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimForDuration, claimInFlight, runExclusively } from './in-flight-entities';

describe('claimInFlight', () => {
    it('refuses a second claim on the same key until the first is released', () => {
        const releaseClaim = claimInFlight('task-delete:1');
        expect(claimInFlight('task-delete:1')).toBeNull();

        releaseClaim();
        const releaseSecondClaim = claimInFlight('task-delete:1');
        expect(releaseSecondClaim).toBeTypeOf('function');
        releaseSecondClaim();
    });

    it('lets different keys run at the same time', () => {
        const releaseFirst = claimInFlight('task-delete:2');
        const releaseSecond = claimInFlight('task-delete:3');
        expect(releaseSecond).toBeTypeOf('function');
        releaseFirst();
        releaseSecond();
    });
});

describe('runExclusively', () => {
    it('runs the work once and calls the busy handler for a repeat while it is running', async () => {
        let finishWork;
        const work = vi.fn(() => new Promise((resolve) => (finishWork = resolve)));
        const onBusy = vi.fn();

        const firstRun = runExclusively('exclusive:1', work, onBusy);
        const repeatRun = await runExclusively('exclusive:1', work, onBusy);

        expect(work).toHaveBeenCalledTimes(1);
        expect(onBusy).toHaveBeenCalledTimes(1);
        expect(repeatRun).toBeUndefined();

        finishWork('done');
        expect(await firstRun).toBe('done');
    });

    it('lets the same key run again once the work has finished', async () => {
        const work = vi.fn().mockResolvedValue('ok');

        await runExclusively('exclusive:2', work);
        await runExclusively('exclusive:2', work);

        expect(work).toHaveBeenCalledTimes(2);
    });

    it('releases the key even when the work throws', async () => {
        const failingWork = vi.fn().mockRejectedValue(new Error('network down'));
        const laterWork = vi.fn().mockResolvedValue('ok');

        await expect(runExclusively('exclusive:3', failingWork)).rejects.toThrow('network down');
        await runExclusively('exclusive:3', laterWork);

        expect(laterWork).toHaveBeenCalledTimes(1);
    });

    it('runs different keys at the same time', async () => {
        let finishFirst;
        const firstWork = vi.fn(() => new Promise((resolve) => (finishFirst = resolve)));
        const secondWork = vi.fn().mockResolvedValue('ok');

        const firstRun = runExclusively('exclusive:4', firstWork);
        await runExclusively('exclusive:5', secondWork);

        expect(secondWork).toHaveBeenCalledTimes(1);
        finishFirst();
        await firstRun;
    });
});

describe('claimForDuration', () => {
    afterEach(() => vi.useRealTimers());

    it('ignores repeats until the time is up, then allows the action again', () => {
        vi.useFakeTimers();

        expect(claimForDuration('cooldown:1', 3000)).toBe(true);
        expect(claimForDuration('cooldown:1', 3000)).toBe(false);

        vi.advanceTimersByTime(2999);
        expect(claimForDuration('cooldown:1', 3000)).toBe(false);

        vi.advanceTimersByTime(1);
        expect(claimForDuration('cooldown:1', 3000)).toBe(true);
    });
});
