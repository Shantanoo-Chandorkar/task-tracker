import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatTile from './StatTile';

describe('StatTile', () => {
    it('renders the label and the value', () => {
        render(<StatTile label="Current streak" value="12d" />);

        expect(screen.getByText('Current streak')).toBeTruthy();
        expect(screen.getByText('12d')).toBeTruthy();
    });
});
