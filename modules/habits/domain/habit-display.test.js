import { describe, expect, it } from 'vitest';
import {
    toCanonicalHabitValue,
    toDisplayHabitValue,
    IMPLICIT_DURATION_UNIT_CODE,
} from './habit-display';

describe('toCanonicalHabitValue / toDisplayHabitValue', () => {
    it('round-trips a quantity value through its built-in unit', () => {
        const habit = { measure_kind: 'quantity', unit_code: 'km' };
        expect(toCanonicalHabitValue(habit, 5)).toBe(5000);
        expect(toDisplayHabitValue(habit, 5000)).toBe(5);
    });

    it('round-trips a duration value through its built-in unit', () => {
        const habit = { measure_kind: 'duration', unit_code: 'min' };
        expect(toCanonicalHabitValue(habit, 10)).toBe(600);
        expect(toDisplayHabitValue(habit, 600)).toBe(10);
    });

    it('defaults a unit-less duration habit to minutes for conversion', () => {
        const habit = { measure_kind: 'duration', unit_code: null };
        expect(toCanonicalHabitValue(habit, 10)).toBe(600);
        expect(toDisplayHabitValue(habit, 600)).toBe(10);
    });

    it('passes a custom (non-built-in) unit through unconverted', () => {
        const habit = { measure_kind: 'quantity', unit_code: 'cups' };
        expect(toCanonicalHabitValue(habit, 3)).toBe(3);
        expect(toDisplayHabitValue(habit, 3)).toBe(3);
    });

    it('passes a count value through unconverted (count has no unit)', () => {
        const habit = { measure_kind: 'count', unit_code: null };
        expect(toCanonicalHabitValue(habit, 20)).toBe(20);
        expect(toDisplayHabitValue(habit, 20)).toBe(20);
    });

    it('passes null through without converting', () => {
        const habit = { measure_kind: 'quantity', unit_code: 'km' };
        expect(toCanonicalHabitValue(habit, null)).toBeNull();
        expect(toDisplayHabitValue(habit, null)).toBeNull();
    });

    it('passes undefined through on the display side', () => {
        const habit = { measure_kind: 'quantity', unit_code: 'km' };
        expect(toDisplayHabitValue(habit, undefined)).toBeUndefined();
    });

    it('exposes the implicit duration unit as a named constant', () => {
        expect(IMPLICIT_DURATION_UNIT_CODE).toBe('min');
    });
});
