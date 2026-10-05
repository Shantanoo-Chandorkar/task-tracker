'use client';

import CharLimitField from '@/components/custom/CharLimitField';
import { Input } from '@/components/ui/input';

/**
 * Colour picker plus capped name input shared by the space, list, sublist and status dialogs.
 *
 * @param {object} props
 * @param {string} props.label - Visible label for the name input, also its placeholder.
 * @param {string} props.name - Current name.
 * @param {(name: string) => void} props.onNameChange - Called with the new name.
 * @param {string} props.color - Current colour as `#rrggbb`.
 * @param {(color: string) => void} props.onColorChange - Called with the new colour.
 * @param {number} props.maxLength - Name length cap.
 * @param {string} [props.error] - Action error shown under the field.
 * @param {boolean} [props.disabled] - Locks both controls while saving.
 */
export default function ColorNameField({
    label,
    name,
    onNameChange,
    color,
    onColorChange,
    maxLength,
    error,
    disabled = false,
}) {
    return (
        <CharLimitField
            label={label}
            currentLength={name.length}
            maxLength={maxLength}
            error={error}
        >
            {(nameControlProps) => (
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        aria-label="Color"
                        value={color}
                        onChange={(event) => onColorChange(event.target.value)}
                        className="h-9 w-11 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
                        disabled={disabled}
                    />
                    <Input
                        {...nameControlProps}
                        value={name}
                        onChange={(event) => onNameChange(event.target.value)}
                        placeholder={label}
                        className="flex-1"
                        autoFocus
                        disabled={disabled}
                        maxLength={maxLength}
                    />
                </div>
            )}
        </CharLimitField>
    );
}
