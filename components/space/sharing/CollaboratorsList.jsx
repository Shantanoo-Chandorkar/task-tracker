'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PERMISSION_LEVEL_LABELS } from '@/lib/permissions/space-permissions';
import { SharingGroup, SharingRow } from './SharingGroup';

/**
 * People who already have access to the space, each with a permission picker and a Remove button.
 *
 * @param {object} props
 * @param {object[]} props.collaborators - Collaborators (`id`, `requester_email`, `permission_level`)
 * @param {Set<string>} props.busyRowKeys - Row keys that are working, such as `permission:<collaboratorId>`
 * @param {(collaboratorId: string, permissionLevel: string) => void} props.onPermissionChange - Saves a new level
 * @param {(collaboratorId: string, email: string) => void} props.onRemove - Asks to remove one collaborator
 */
export default function CollaboratorsList({
    collaborators,
    busyRowKeys,
    onPermissionChange,
    onRemove,
}) {
    return (
        <SharingGroup title="Collaborators">
            {collaborators.map((collaborator) => (
                <SharingRow key={collaborator.id}>
                    <span className="text-sm truncate">{collaborator.requester_email}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Select
                            value={collaborator.permission_level}
                            disabled={busyRowKeys.has(`permission:${collaborator.id}`)}
                            onValueChange={(newPermissionLevel) =>
                                onPermissionChange(collaborator.id, newPermissionLevel)
                            }
                        >
                            <SelectTrigger
                                className="h-7 w-auto text-xs"
                                aria-label={`Permission for ${collaborator.requester_email}`}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(PERMISSION_LEVEL_LABELS).map(([level, label]) => (
                                    <SelectItem key={level} value={level}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label="Remove collaborator"
                            onClick={() => onRemove(collaborator.id, collaborator.requester_email)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </SharingRow>
            ))}
        </SharingGroup>
    );
}
