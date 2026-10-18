import { describe, expect, it } from 'vitest';
import { getStatusGroupFlagKey, isStatusGroupCollapsed } from './status-group-collapse';

const TODO = { id: 'st-todo', code: 'todo' };
const DONE = { id: 'st-done', code: 'done' };
const CUSTOM = { id: 'st-custom', code: null };

describe('getStatusGroupFlagKey', () => {
    it('keeps the plain key for every status except Done', () => {
        expect(getStatusGroupFlagKey('direct', TODO)).toBe('direct:st-todo');
        expect(getStatusGroupFlagKey('direct', CUSTOM)).toBe('direct:st-custom');
    });

    it('gives Done its own expanded key, so it never shares a flag with a collapse meaning', () => {
        expect(getStatusGroupFlagKey('direct', DONE)).toBe('direct:st-done:expanded');
    });

    it('keeps the key of the No Status group', () => {
        expect(getStatusGroupFlagKey('sublist-1', null)).toBe('sublist-1:none');
    });
});

describe('isStatusGroupCollapsed', () => {
    it('starts every group except Done expanded', () => {
        expect(isStatusGroupCollapsed({}, 'direct', TODO)).toBe(false);
        expect(isStatusGroupCollapsed({}, 'direct', CUSTOM)).toBe(false);
        expect(isStatusGroupCollapsed({}, 'direct', null)).toBe(false);
    });

    it('collapses a group once its flag is set', () => {
        expect(isStatusGroupCollapsed({ 'direct:st-todo': true }, 'direct', TODO)).toBe(true);
        expect(isStatusGroupCollapsed({ 'direct:none': true }, 'direct', null)).toBe(true);
    });

    it('starts Done collapsed', () => {
        expect(isStatusGroupCollapsed({}, 'direct', DONE)).toBe(true);
    });

    it('expands Done once the user toggled it, and collapses it again on the next toggle', () => {
        expect(isStatusGroupCollapsed({ 'direct:st-done:expanded': true }, 'direct', DONE)).toBe(
            false,
        );
        expect(isStatusGroupCollapsed({ 'direct:st-done:expanded': false }, 'direct', DONE)).toBe(
            true,
        );
    });

    it('keeps each bucket independent', () => {
        const groupFlags = { 'direct:st-done:expanded': true };

        expect(isStatusGroupCollapsed(groupFlags, 'direct', DONE)).toBe(false);
        expect(isStatusGroupCollapsed(groupFlags, 'sublist-1', DONE)).toBe(true);
    });
});
