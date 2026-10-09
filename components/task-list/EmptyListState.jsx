'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import ListHeader from './ListHeader';

/**
 * What a list shows before it has any task or sublist: the header and a prompt to add the first task.
 *
 * @param {object} props
 * @param {string} props.listId - The list that is empty
 * @param {object[]} [props.initialSpaces] - SSR-fetched spaces, passed through to ListHeader
 * @param {object[]} [props.initialLists] - SSR-fetched lists, passed through to ListHeader
 * @param {boolean} props.canWrite - Whether the caller may create tasks (false for read-only collaborators)
 */
export default function EmptyListState({ listId, initialSpaces, initialLists, canWrite }) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    return (
        <>
            <ListHeader listId={listId} initialSpaces={initialSpaces} initialLists={initialLists} />
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 sm:py-24 text-center">
                <p className="text-muted-foreground text-sm mb-4">
                    No tasks yet. Add your first task to get started.
                </p>
                {canWrite && (
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        New Task
                    </Button>
                )}
            </div>
            <TaskFormDialog
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                parentId={null}
                listId={listId}
            />
        </>
    );
}
