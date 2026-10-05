'use client';

import { ChevronDown, ChevronUp, Settings } from 'lucide-react';

const FOOTER_BUTTON_CLASS =
    'flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted';

/**
 * Bottom row of a space card: Settings for everyone, plus Share this space for a registered owner or Leave space for
 * a collaborator.
 *
 * @param {object} props
 * @param {boolean} props.isOwner - Whether the current user owns this space
 * @param {boolean} props.canShareSpace - Whether the Share button is shown (registered owner)
 * @param {boolean} props.isSharingOpen - Whether the sharing panel below is open
 * @param {string} props.sharingPanelId - Id of the sharing panel, for `aria-controls`
 * @param {Function} props.onOpenSettings - Opens the settings sheet
 * @param {Function} props.onToggleSharing - Opens or closes the sharing panel
 * @param {Function} props.onLeaveSpace - Asks to leave the space
 */
export default function SpaceFooterActions({
    isOwner,
    canShareSpace,
    isSharingOpen,
    sharingPanelId,
    onOpenSettings,
    onToggleSharing,
    onLeaveSpace,
}) {
    return (
        <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
            <button
                type="button"
                onClick={onOpenSettings}
                className={FOOTER_BUTTON_CLASS}
                aria-label="Space settings"
            >
                <Settings className="h-3 w-3" />
                Settings
            </button>
            {canShareSpace && (
                <button
                    type="button"
                    onClick={onToggleSharing}
                    aria-expanded={isSharingOpen}
                    aria-controls={sharingPanelId}
                    className={FOOTER_BUTTON_CLASS}
                >
                    Share this space
                    {isSharingOpen ? (
                        <ChevronUp aria-hidden="true" className="h-3 w-3" />
                    ) : (
                        <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    )}
                </button>
            )}
            {!isOwner && (
                <button
                    type="button"
                    onClick={onLeaveSpace}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-muted"
                >
                    Leave space
                </button>
            )}
        </div>
    );
}
