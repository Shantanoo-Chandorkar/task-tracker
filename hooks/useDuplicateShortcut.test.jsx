import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { useDuplicateShortcut } from './useDuplicateShortcut';

const mocks = vi.hoisted(() => ({ duplicateTaskById: vi.fn() }));

vi.mock('@/hooks/useDuplicateTask', () => ({
    useDuplicateTask: () => ({ duplicateTaskById: mocks.duplicateTaskById }),
}));

function pressCtrlD(target = document.body, extra = {}) {
    return fireEvent.keyDown(target, { key: 'd', ctrlKey: true, ...extra });
}

describe('useDuplicateShortcut', () => {
    beforeEach(() => mocks.duplicateTaskById.mockReset());
    afterEach(() => document.body.replaceChildren());

    it('does nothing until a row has been remembered', () => {
        renderHook(() => useDuplicateShortcut('list-1'));

        pressCtrlD();

        expect(mocks.duplicateTaskById).not.toHaveBeenCalled();
    });

    it('duplicates the remembered row and keeps the browser from bookmarking the page', () => {
        const { result } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));

        const wasNotCancelled = pressCtrlD();

        expect(mocks.duplicateTaskById).toHaveBeenCalledWith('task-1');
        expect(wasNotCancelled).toBe(false);
    });

    it('acts on the row remembered last', () => {
        const { result } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));
        act(() => result.current('task-2'));

        pressCtrlD();

        expect(mocks.duplicateTaskById).toHaveBeenCalledTimes(1);
        expect(mocks.duplicateTaskById).toHaveBeenCalledWith('task-2');
    });

    it.each([
        ['an input', 'input'],
        ['a textarea', 'textarea'],
        ['a select', 'select'],
    ])('leaves the key alone while the user is in %s', (label, tagName) => {
        const { result } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));
        const field = document.body.appendChild(document.createElement(tagName));

        const wasNotCancelled = pressCtrlD(field);

        expect(mocks.duplicateTaskById).not.toHaveBeenCalled();
        expect(wasNotCancelled).toBe(true);
    });

    it('leaves the key alone inside a dialog', () => {
        const { result } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));
        const dialog = document.body.appendChild(document.createElement('div'));
        dialog.setAttribute('role', 'dialog');
        const inner = dialog.appendChild(document.createElement('span'));

        pressCtrlD(inner);

        expect(mocks.duplicateTaskById).not.toHaveBeenCalled();
    });

    it('swallows a held-down key without duplicating again', () => {
        const { result } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));

        const wasNotCancelled = pressCtrlD(document.body, { repeat: true });

        expect(mocks.duplicateTaskById).not.toHaveBeenCalled();
        expect(wasNotCancelled).toBe(false);
    });

    it('stops listening when unmounted', () => {
        const { result, unmount } = renderHook(() => useDuplicateShortcut('list-1'));
        act(() => result.current('task-1'));
        unmount();

        pressCtrlD();

        expect(mocks.duplicateTaskById).not.toHaveBeenCalled();
    });
});
