'use client';

import { useState } from 'react';

/**
 * Builds a dialog only once it has been opened, and keeps it afterwards so its close animation still plays.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog inside is open; the first `true` mounts the children.
 * @param {import('react').ReactNode} props.children - The dialog, which still gets its own `open` prop.
 */
export default function MountOnFirstOpen({ open, children }) {
    const [hasBeenOpened, setHasBeenOpened] = useState(open);

    // Adjusted during render, not in an effect, so the dialog mounts already open with no extra frame
    if (open && !hasBeenOpened) setHasBeenOpened(true);

    return hasBeenOpened ? children : null;
}
