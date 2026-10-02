import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { setFlag, useUIFlags } from './UIStateProvider';

afterEach(() => {
    cleanup();
    act(() => {
        setFlag('group:a', false);
        setFlag('group:b', false);
        setFlag('task-row:unrelated', false);
    });
});

const WATCHED_KEYS = ['group:a', 'group:b'];

function Watcher() {
    const flags = useUIFlags(WATCHED_KEYS);
    return <p>{`a=${flags['group:a']} b=${flags['group:b']}`}</p>;
}

describe('useUIFlags', () => {
    it('reads the current value of each watched flag', () => {
        act(() => setFlag('group:b', true));
        render(<Watcher />);

        expect(screen.getByText('a=false b=true')).toBeTruthy();
    });

    it('updates when a watched flag changes', () => {
        render(<Watcher />);

        act(() => setFlag('group:a', true));

        expect(screen.getByText('a=true b=false')).toBeTruthy();
    });

    it('does not re-render when a flag it is not watching changes', () => {
        const onRender = vi.fn();
        render(
            <Profiler id="watcher" onRender={onRender}>
                <Watcher />
            </Profiler>,
        );
        onRender.mockClear();

        act(() => setFlag('task-row:unrelated', true));

        expect(onRender).not.toHaveBeenCalled();
    });

    it('does re-render when a watched flag changes, which proves the check above can fail', () => {
        const onRender = vi.fn();
        render(
            <Profiler id="watcher" onRender={onRender}>
                <Watcher />
            </Profiler>,
        );
        onRender.mockClear();

        act(() => setFlag('group:a', true));

        expect(onRender).toHaveBeenCalled();
    });
});
