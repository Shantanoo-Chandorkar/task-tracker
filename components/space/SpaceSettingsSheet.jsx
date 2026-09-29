'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import StatusManager from '@/components/status/StatusManager';
import TagManager from '@/components/tag/TagManager';
import SpacePreferencesSection from '@/components/space/SpacePreferencesSection';
import WebhookSettingsSection from '@/components/webhook/WebhookSettingsSection';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';

/**
 * One collapsible section of the settings sheet. Only one section is open at a time.
 *
 * @param {object} props
 * @param {string} props.title - Section label
 * @param {boolean} props.isOpen - Whether this section's body is expanded
 * @param {Function} props.onToggle - Called to expand/collapse this section
 * @param {import('react').ReactNode} props.children - Section body, rendered only while open
 */
function SettingsSection({ title, isOpen, onToggle, children }) {
    return (
        <div className="border-t border-border first:border-t-0">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between px-1 py-2.5 text-sm font-medium text-foreground"
            >
                {title}
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isOpen && <div className="pb-3">{children}</div>}
        </div>
    );
}

/**
 * Per-space settings sheet, opened from a gear icon on the space card.
 *
 * Holds Statuses/Tags/future toggles in one place instead of scattering them as separate accordion rows on the card.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is open
 * @param {Function} props.onClose - Called when the sheet should close
 * @param {string} props.spaceId - Space these settings belong to
 * @param {string} props.spaceName - Space name, shown in the sheet title
 * @param {boolean} props.isOwner - Whether the current user owns this space
 */
export default function SpaceSettingsSheet({ open, onClose, spaceId, spaceName, isOwner }) {
    const [openSection, setOpenSection] = useState(null);
    const { data: profile } = useCurrentUserProfileQuery();
    // Guests cannot use webhooks, and the section stays hidden until the profile confirms a registered user
    const canManageWebhooks = isOwner && profile?.is_guest === false;

    function toggleSection(sectionKey) {
        setOpenSection((current) => (current === sectionKey ? null : sectionKey));
    }

    return (
        <ModalShell open={open} onClose={onClose} variant="sheet" title={`${spaceName} · Settings`}>
            <div className="max-h-[70vh] overflow-y-auto">
                <SettingsSection
                    title="Statuses"
                    isOpen={openSection === 'statuses'}
                    onToggle={() => toggleSection('statuses')}
                >
                    <StatusManager spaceId={spaceId} />
                </SettingsSection>
                <SettingsSection
                    title="Tags"
                    isOpen={openSection === 'tags'}
                    onToggle={() => toggleSection('tags')}
                >
                    <TagManager spaceId={spaceId} />
                </SettingsSection>
                <SettingsSection
                    title="Preferences"
                    isOpen={openSection === 'preferences'}
                    onToggle={() => toggleSection('preferences')}
                >
                    <SpacePreferencesSection spaceId={spaceId} isOwner={isOwner} />
                </SettingsSection>
                {canManageWebhooks && (
                    <SettingsSection
                        title="Webhooks"
                        isOpen={openSection === 'webhooks'}
                        onToggle={() => toggleSection('webhooks')}
                    >
                        <WebhookSettingsSection spaceId={spaceId} />
                    </SettingsSection>
                )}
            </div>
        </ModalShell>
    );
}
