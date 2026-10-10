'use client';

import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/ui/copy-to-clipboard';

/**
 * Shows a space's id with a copy button, and a button that copies its join link.
 *
 * @param {object} props
 * @param {string} props.spaceId - Space being shared
 */
export default function ShareLinkControls({ spaceId }) {
    return (
        <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{spaceId}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    aria-label="Copy space ID"
                    onClick={() => copyToClipboard(spaceId, 'Space ID')}
                >
                    <Copy className="h-3 w-3" />
                </Button>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() =>
                    copyToClipboard(`${window.location.origin}/spaces?join=${spaceId}`, 'Join link')
                }
            >
                <Copy className="h-3.5 w-3.5" />
                Copy join link
            </Button>
        </>
    );
}
