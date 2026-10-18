import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useHabitEntryValue } from './useHabitEntryValue';

const setHabitEntryValue = vi.fn();
const setHabitEntryValues = vi.fn();

vi.mock('@/modules/habits/actions/habit-entry-actions', () => ({
    setHabitEntryValue: (...args) => setHabitEntryValue(...args),
    setHabitEntryValues: (...args) => setHabitEntryValues(...args),
}));
vi.mock('sonner', () => ({
    toast: {
        loading: () => 'toast-id',
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

function renderValueHook(queryClient = new QueryClient()) {
    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { result: renderHook(() => useHabitEntryValue(), { wrapper }).result, queryClient };
}

describe('useHabitEntryValue.setValues', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls the action once regardless of how many days are in the batch', async () => {
        const habit = { id: 'habit-batch-1' };
        setHabitEntryValues.mockResolvedValue({
            data: { upsertedEntries: [], clearedLocalDates: [] },
            error: null,
        });
        const { result } = renderValueHook();

        const draftEntries = [
            { localDate: '2026-10-16', rawValue: '3' },
            { localDate: '2026-10-17', rawValue: '4' },
            { localDate: '2026-10-18', rawValue: '5' },
        ];
        const saved = await result.current.setValues(habit, draftEntries);

        expect(saved).toBe(true);
        expect(setHabitEntryValues).toHaveBeenCalledOnce();
        expect(setHabitEntryValues).toHaveBeenCalledWith('habit-batch-1', draftEntries);
    });

    it('patches the cache with created, updated and cleared rows from one batch', async () => {
        const habit = { id: 'habit-batch-2' };
        const queryClient = new QueryClient();
        queryClient.setQueryData(
            ['habit-entries'],
            [
                {
                    id: 'entry-other-habit',
                    habit_id: 'habit-other',
                    local_date: '2026-10-16',
                    value: 1,
                },
                { id: 'entry-old', habit_id: 'habit-batch-2', local_date: '2026-10-16', value: 5 },
                {
                    id: 'entry-cleared',
                    habit_id: 'habit-batch-2',
                    local_date: '2026-10-17',
                    value: 2,
                },
            ],
        );
        setHabitEntryValues.mockResolvedValue({
            data: {
                upsertedEntries: [
                    {
                        id: 'entry-old',
                        habit_id: 'habit-batch-2',
                        local_date: '2026-10-16',
                        value: 9,
                    },
                    {
                        id: 'entry-new',
                        habit_id: 'habit-batch-2',
                        local_date: '2026-10-18',
                        value: 3,
                    },
                ],
                clearedLocalDates: ['2026-10-17'],
            },
            error: null,
        });
        const { result } = renderValueHook(queryClient);

        await result.current.setValues(habit, [
            { localDate: '2026-10-16', rawValue: '9' },
            { localDate: '2026-10-18', rawValue: '3' },
            { localDate: '2026-10-17', rawValue: null },
        ]);

        const cachedEntries = queryClient.getQueryData(['habit-entries']);
        expect(cachedEntries).toEqual(
            expect.arrayContaining([
                {
                    id: 'entry-other-habit',
                    habit_id: 'habit-other',
                    local_date: '2026-10-16',
                    value: 1,
                },
                { id: 'entry-old', habit_id: 'habit-batch-2', local_date: '2026-10-16', value: 9 },
                { id: 'entry-new', habit_id: 'habit-batch-2', local_date: '2026-10-18', value: 3 },
            ]),
        );
        expect(cachedEntries.find((row) => row.id === 'entry-cleared')).toBeUndefined();
        expect(cachedEntries).toHaveLength(3);
    });

    it('never touches another habit’s entry that happens to share a cleared local date', async () => {
        const habit = { id: 'habit-batch-3' };
        const queryClient = new QueryClient();
        queryClient.setQueryData(
            ['habit-entries'],
            [
                {
                    id: 'entry-other-habit',
                    habit_id: 'habit-other',
                    local_date: '2026-10-17',
                    value: 1,
                },
            ],
        );
        setHabitEntryValues.mockResolvedValue({
            data: { upsertedEntries: [], clearedLocalDates: ['2026-10-17'] },
            error: null,
        });
        const { result } = renderValueHook(queryClient);

        await result.current.setValues(habit, [{ localDate: '2026-10-17', rawValue: null }]);

        expect(queryClient.getQueryData(['habit-entries'])).toEqual([
            {
                id: 'entry-other-habit',
                habit_id: 'habit-other',
                local_date: '2026-10-17',
                value: 1,
            },
        ]);
    });

    it('shows the server error and returns false without patching the cache', async () => {
        const habit = { id: 'habit-batch-4' };
        setHabitEntryValues.mockResolvedValue({ data: null, error: 'Day 2026-10-16: bad value' });
        const { result } = renderValueHook();

        const saved = await result.current.setValues(habit, [
            { localDate: '2026-10-16', rawValue: 'nope' },
        ]);

        expect(saved).toBe(false);
        expect(toast.error).toHaveBeenCalledWith('Day 2026-10-16: bad value', { id: 'toast-id' });
    });

    it('shows an unreachable-server message when the call itself throws', async () => {
        const habit = { id: 'habit-batch-5' };
        setHabitEntryValues.mockRejectedValue(new Error('network down'));
        const { result } = renderValueHook();

        const saved = await result.current.setValues(habit, [
            { localDate: '2026-10-16', rawValue: '1' },
        ]);

        expect(saved).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            'Could not reach the server. Check your connection and try again.',
            { id: 'toast-id' },
        );
    });
});
