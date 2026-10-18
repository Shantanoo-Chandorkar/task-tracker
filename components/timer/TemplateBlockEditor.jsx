'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { TEMPLATE_BLOCK_KINDS, TEMPLATE_BLOCK_MAX_COUNT } from '@/modules/timer/timer-limits';

const LABEL_BY_KIND = { work: 'Work', break: 'Break' };
const NEW_BLOCK = { kind: 'work', label: '', durationSeconds: 1500 };

/**
 * Inline editor for a template's work/break block list - one row per block, reordered with
 * Move Up/Down buttons rather than drag (decision 0 removed drag-and-drop everywhere).
 *
 * @param {object} props
 * @param {Array<{ kind: string, label: string, durationSeconds: number }>} props.blocks - Current blocks.
 * @param {(blocks: object[]) => void} props.onChange - Called with the full updated list.
 * @param {boolean} [props.disabled] - Whether every control is locked (e.g. while saving).
 */
export default function TemplateBlockEditor({ blocks, onChange, disabled = false }) {
    function updateBlock(blockIndex, patch) {
        onChange(
            blocks.map((block, currentIndex) =>
                currentIndex === blockIndex ? { ...block, ...patch } : block,
            ),
        );
    }

    function removeBlock(blockIndex) {
        onChange(blocks.filter((_unused, currentIndex) => currentIndex !== blockIndex));
    }

    function moveBlock(blockIndex, direction) {
        const targetIndex = blockIndex + direction;
        if (targetIndex < 0 || targetIndex >= blocks.length) return;
        const reorderedBlocks = [...blocks];
        [reorderedBlocks[blockIndex], reorderedBlocks[targetIndex]] = [
            reorderedBlocks[targetIndex],
            reorderedBlocks[blockIndex],
        ];
        onChange(reorderedBlocks);
    }

    function addBlock() {
        if (blocks.length >= TEMPLATE_BLOCK_MAX_COUNT) return;
        onChange([...blocks, { ...NEW_BLOCK }]);
    }

    return (
        <div className="space-y-2">
            {blocks.map((block, blockIndex) => (
                <div key={blockIndex} className="flex items-center gap-1.5">
                    <Select
                        value={block.kind}
                        onValueChange={(kind) => updateBlock(blockIndex, { kind })}
                        disabled={disabled}
                    >
                        <SelectTrigger className="w-20 flex-shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TEMPLATE_BLOCK_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {LABEL_BY_KIND[kind]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        aria-label={`Block ${blockIndex + 1} label`}
                        value={block.label}
                        onChange={(event) => updateBlock(blockIndex, { label: event.target.value })}
                        placeholder={LABEL_BY_KIND[block.kind]}
                        disabled={disabled}
                        className="min-w-0 flex-1"
                    />
                    <Input
                        aria-label={`Block ${blockIndex + 1} minutes`}
                        type="number"
                        min={1}
                        max={240}
                        value={Math.round(block.durationSeconds / 60)}
                        onChange={(event) =>
                            updateBlock(blockIndex, {
                                durationSeconds: Number(event.target.value) * 60,
                            })
                        }
                        disabled={disabled}
                        className="w-16 flex-shrink-0"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveBlock(blockIndex, -1)}
                        disabled={disabled || blockIndex === 0}
                        aria-label="Move block up"
                    >
                        <ChevronUp className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveBlock(blockIndex, 1)}
                        disabled={disabled || blockIndex === blocks.length - 1}
                        aria-label="Move block down"
                    >
                        <ChevronDown className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBlock(blockIndex)}
                        disabled={disabled}
                        aria-label="Remove block"
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBlock}
                disabled={disabled || blocks.length >= TEMPLATE_BLOCK_MAX_COUNT}
            >
                + Add block
            </Button>
        </div>
    );
}
