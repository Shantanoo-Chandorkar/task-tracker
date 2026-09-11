'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, ListChecks, ListPlus, LayoutGrid } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import SpaceFormDialog from '@/components/space/SpaceFormDialog';
import ListFormDialog from '@/components/space/ListFormDialog';

/**
 * Floating action button with a New Task / New List / New Space speed-dial.
 *
 * @param {object} props
 * @param {string} props.className - Positioning + sizing classes for the button itself
 */
export default function QuickCreateFab({ className }) {
    const router = useRouter();
    const params = useParams();
    const listId = params?.listId;

    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
    const [listDialogOpen, setListDialogOpen] = useState(false);

    function handleNewTask() {
        if (listId) {
            setTaskDialogOpen(true);
        } else {
            // No list in scope (on Spaces/Settings) — `/` dynamically resolves to
            // whichever list is actually first, so the option lands somewhere useful.
            router.push('/');
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button aria-label="Create new..." className={className}>
                        <Plus className="h-6 w-6" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onClick={handleNewTask} className="gap-2">
                        <ListChecks className="h-3.5 w-3.5" />
                        New Task
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setListDialogOpen(true)} className="gap-2">
                        <ListPlus className="h-3.5 w-3.5" />
                        New List
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSpaceDialogOpen(true)} className="gap-2">
                        <LayoutGrid className="h-3.5 w-3.5" />
                        New Space
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {listId && (
                <TaskFormDialog
                    open={taskDialogOpen}
                    onClose={() => setTaskDialogOpen(false)}
                    listId={listId}
                />
            )}
            <SpaceFormDialog open={spaceDialogOpen} onClose={() => setSpaceDialogOpen(false)} />
            <ListFormDialog open={listDialogOpen} onClose={() => setListDialogOpen(false)} />
        </>
    );
}
