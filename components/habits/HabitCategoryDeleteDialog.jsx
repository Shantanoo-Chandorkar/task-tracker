'use client';

import ModalShell from '@/components/custom/ModalShell';
import { Loader } from '@/components/custom/Loader';
import { AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

/**
 * Confirm popup for deleting a habit category - never removes its habits, which just lose the category.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the popup is open.
 * @param {() => void} props.onClose - Called when the popup should close (cancel, Esc, outside click).
 * @param {() => void} props.onConfirm - Called when Delete is pressed.
 * @param {string} props.categoryName - Name shown in the popup title.
 * @param {boolean} props.isPending - Whether the delete is running; locks the popup and shows the spinner.
 * @param {string} [props.errorMessage] - Error from the last attempt, shown inside the popup.
 */
export default function HabitCategoryDeleteDialog({
    open,
    onClose,
    onConfirm,
    categoryName,
    isPending,
    errorMessage,
}) {
    return (
        <ModalShell
            open={open}
            onClose={onClose}
            isBusy={isPending}
            errorMessage={errorMessage}
            variant="alert"
            title={<>Delete &ldquo;{categoryName}&rdquo;?</>}
            description="Habits in this category keep their check-ins and move to no category."
            footer={
                <>
                    <AlertDialogCancel onClick={onClose} disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isPending}
                        className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isPending && <Loader size="xs" />}
                        Delete
                    </AlertDialogAction>
                </>
            }
        />
    );
}
