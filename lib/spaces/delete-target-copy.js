import { pluralize } from '@/lib/ui/pluralize';

const TOASTS_BY_TYPE = {
    space: { loading: 'Deleting space...', done: 'Space deleted' },
    list: { loading: 'Deleting list...', done: 'List deleted' },
    'leave-space': { loading: 'Leaving space...', done: 'Left space' },
};

/**
 * Gives the loading and success toast texts for deleting a space, deleting a list, or leaving a space.
 *
 * @param {'space'|'list'|'leave-space'} type - What the confirm popup is for
 * @returns {{ loading: string, done: string }} Toast texts
 */
export function getDeleteToasts(type) {
    return TOASTS_BY_TYPE[type];
}

/**
 * Words the confirm popup for deleting a space or list, or leaving a space.
 *
 * @param {{ type: 'space'|'list'|'leave-space', name: string, counts: object|null }|null} deleteTarget - What the
 *   user chose; `counts` holds `{ lists, tasks }` for a space and `{ tasks }` for a list, or null when unknown
 * @returns {{ title: string, description: string, confirmLabel: string }} Texts for the popup; a closed popup
 *   (null target) still gets the plain wording
 */
export function describeDeleteTarget(deleteTarget) {
    const type = deleteTarget?.type;
    const name = deleteTarget?.name;
    const counts = deleteTarget?.counts;

    if (type === 'leave-space') {
        return {
            title: `Leave "${name}"?`,
            description: "You'll lose access to this space's lists and tasks.",
            confirmLabel: 'Leave',
        };
    }

    let description = 'This cannot be undone.';
    if (type === 'space' && counts) {
        description = `This deletes ${pluralize(counts.lists, 'list')} and ${pluralize(counts.tasks, 'task')}. This cannot be undone.`;
    } else if (type === 'list' && counts) {
        description = `This deletes ${pluralize(counts.tasks, 'task')}. This cannot be undone.`;
    }
    return { title: `Delete "${name}"?`, description, confirmLabel: 'Delete' };
}
