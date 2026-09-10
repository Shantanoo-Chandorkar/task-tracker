'use client';

import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';

/**
 * Registers `public/sw.js` and wires up the update-available toast. Mounted
 * once in `app/layout.js`, same pattern as the other nav-adjacent singletons
 * there. Renders nothing.
 */
export default function ServiceWorkerRegister() {
    useServiceWorkerUpdate();
    return null;
}
