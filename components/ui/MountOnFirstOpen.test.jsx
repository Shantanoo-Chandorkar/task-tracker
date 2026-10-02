import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MountOnFirstOpen from './MountOnFirstOpen';

afterEach(cleanup);

const mounted = vi.fn();

function Probe() {
    useEffect(() => mounted(), []);
    return <p>dialog</p>;
}

describe('MountOnFirstOpen', () => {
    it('builds nothing while the dialog has never been opened', () => {
        mounted.mockClear();
        render(
            <MountOnFirstOpen open={false}>
                <Probe />
            </MountOnFirstOpen>,
        );

        expect(screen.queryByText('dialog')).toBeNull();
        expect(mounted).not.toHaveBeenCalled();
    });

    it('mounts the children the first time it opens', () => {
        const { rerender } = render(
            <MountOnFirstOpen open={false}>
                <Probe />
            </MountOnFirstOpen>,
        );

        rerender(
            <MountOnFirstOpen open>
                <Probe />
            </MountOnFirstOpen>,
        );

        expect(screen.getByText('dialog')).toBeTruthy();
    });

    it('keeps the children mounted once closed again, so a close animation can finish', () => {
        mounted.mockClear();
        const { rerender } = render(
            <MountOnFirstOpen open>
                <Probe />
            </MountOnFirstOpen>,
        );

        rerender(
            <MountOnFirstOpen open={false}>
                <Probe />
            </MountOnFirstOpen>,
        );

        expect(screen.getByText('dialog')).toBeTruthy();
        expect(mounted).toHaveBeenCalledTimes(1);
    });
});
