import { describe, expect, it } from 'vitest';
import { claimInFlight } from './in-flight-entities';

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
