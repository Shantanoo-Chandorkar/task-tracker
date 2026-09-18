'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

/**
 * Reusable export trigger - drop anywhere with a `scope` describing what to export, and it
 * adapts: the menu always offers CSV/JSON for that scope, hitting the same `/api/export` route.
 * Each item is a plain link so the browser handles the download via the route's
 * `Content-Disposition` header - no client-side fetch/blob handling needed.
 *
 * @param {object} props
 * @param {object} props.scope - What to export
 * @param {'list'|'sublist'|'space'} props.scope.type
 * @param {string} props.scope.id
 * @param {'icon'|'menu-items'} [props.variant] - 'icon' (default): standalone icon + dropdown.
 *   'menu-items': bare items to compose inside an existing DropdownMenuContent.
 */
export default function ExportMenu({ scope, variant = 'icon' }) {
    const handleExportClick = () => {
        toast.success('Export downloading in the background, you can keep browsing.');
    };

    const items = (
        <>
            <DropdownMenuItem asChild>
                <a href={`/api/export?type=${scope.type}&id=${scope.id}&format=csv`} download onClick={handleExportClick}>
                    Export as CSV
                </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <a href={`/api/export?type=${scope.type}&id=${scope.id}&format=json`} download onClick={handleExportClick}>
                    Export as JSON
                </a>
            </DropdownMenuItem>
        </>
    );

    if (variant === 'menu-items') return items;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Export"
                >
                    <FileDown className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{items}</DropdownMenuContent>
        </DropdownMenu>
    );
}
