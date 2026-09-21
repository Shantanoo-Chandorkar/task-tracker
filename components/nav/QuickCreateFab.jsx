'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ListChecks, ListPlus, LayoutGrid, FolderPlus } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import TaskFormDialog from '@/components/task-form/TaskFormDialog';
import { useListsQuery } from '@/hooks/useListsQuery';
import SpaceFormDialog from '@/components/space/SpaceFormDialog';
import ListFormDialog from '@/components/space/ListFormDialog';
import SublistFormDialog from '@/components/space/SublistFormDialog';

/**
 * Floating action button with a New Task / New List / New Space speed-dial.
 *
 * @param {object} props
 * @param {string} props.className - Positioning + sizing classes for the button itself
 */
export default function QuickCreateFab({ className }) {
    const queryClient = useQueryClient();
    const params = useParams();
    const listId = params?.listId;
    const { data: lists = [] } = useListsQuery();

    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [fallbackListId, setFallbackListId] = useState(null);
    const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
    const [listDialogOpen, setListDialogOpen] = useState(false);
    const [sublistDialogOpen, setSublistDialogOpen] = useState(false);

    const newTaskListId = listId ?? fallbackListId;

    /**
     * Opens the new-task dialog for the open list, or for a fallback list when none is open.
     */
    function openNewTaskDialog() {
        if (!listId) {
            // Home, Spaces and Settings have no open list, so use the most recently active one, else the first
            const recentListId = queryClient.getQueryData(['home'])?.recentLists?.[0]?.id;
            const targetListId = recentListId ?? lists[0]?.id;
            if (!targetListId) {
                toast.error('Create a list first, then add tasks to it.');
                setListDialogOpen(true);
                return;
            }
            setFallbackListId(targetListId);
        }
        setTaskDialogOpen(true);
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
                    <DropdownMenuItem onClick={openNewTaskDialog} className="gap-2">
                        <ListChecks className="h-3.5 w-3.5" />
                        New Task
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setListDialogOpen(true)} className="gap-2">
                        <ListPlus className="h-3.5 w-3.5" />
                        New List
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSublistDialogOpen(true)} className="gap-2">
                        <FolderPlus className="h-3.5 w-3.5" />
                        New Sublist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSpaceDialogOpen(true)} className="gap-2">
                        <LayoutGrid className="h-3.5 w-3.5" />
                        New Space
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {newTaskListId && (
                <TaskFormDialog
                    open={taskDialogOpen}
                    onClose={() => setTaskDialogOpen(false)}
                    listId={newTaskListId}
                />
            )}
            <SpaceFormDialog open={spaceDialogOpen} onClose={() => setSpaceDialogOpen(false)} />
            <ListFormDialog open={listDialogOpen} onClose={() => setListDialogOpen(false)} />
            <SublistFormDialog open={sublistDialogOpen} onClose={() => setSublistDialogOpen(false)} />
        </>
    );
}
