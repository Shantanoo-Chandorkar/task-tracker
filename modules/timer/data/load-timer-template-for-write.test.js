import { describe, expect, it, vi } from 'vitest';
import { loadTimerTemplateForWrite } from './load-timer-template-for-write';

const NOT_FOUND_FAILURE = { error: 'Template not found', code: 'TIMER_TEMPLATE_NOT_FOUND' };

/**
 * Fake Supabase client whose `timer_templates` select resolves to one row (or none).
 *
 * @param {object|null} template - Row `maybeSingle()` resolves to, or null for no visible row.
 * @returns {object} A `from`-only fake client, plus the `eq` spy for assertions.
 */
function makeSupabase(template) {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: template })),
    };
    return { from: vi.fn(() => query), query };
}

describe('loadTimerTemplateForWrite', () => {
    it('returns the template when it is visible to the caller', async () => {
        const template = { id: 'template-1', name: 'Pomodoro' };
        const supabase = makeSupabase(template);

        expect(await loadTimerTemplateForWrite(supabase, 'template-1', NOT_FOUND_FAILURE)).toEqual({
            template,
            failure: null,
        });
    });

    it('returns the not-found failure when nothing is visible - unknown id or another user’s row alike', async () => {
        const supabase = makeSupabase(null);

        expect(
            await loadTimerTemplateForWrite(supabase, 'template-missing', NOT_FOUND_FAILURE),
        ).toEqual({ template: null, failure: NOT_FOUND_FAILURE });
    });

    it('filters by the given id', async () => {
        const { from, query } = makeSupabase({ id: 'template-1' });

        await loadTimerTemplateForWrite({ from }, 'template-1', NOT_FOUND_FAILURE);

        expect(query.eq).toHaveBeenCalledWith('id', 'template-1');
    });
});
