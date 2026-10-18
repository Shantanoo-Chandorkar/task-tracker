const DONE_STATUS_CODE = 'done';

/**
 * Names the UI flag that remembers whether the user has toggled a status group.
 *
 * A Done group gets its own key, because its flag means "expanded" while every other group's flag means "collapsed".
 *
 * @param {string} bucketKey - Key of the bucket the group sits in (main list or one sublist)
 * @param {{ id: string, code?: string|null }|null} status - The group's status, or null for "No Status"
 * @returns {string} Flag key to read and toggle
 */
export function getStatusGroupFlagKey(bucketKey, status) {
    if (!status) return `${bucketKey}:none`;
    const groupKey = `${bucketKey}:${status.id}`;
    return status.code === DONE_STATUS_CODE ? `${groupKey}:expanded` : groupKey;
}

/**
 * Tells whether a status group is collapsed: Done starts collapsed, every other group starts expanded.
 *
 * @param {Object<string, boolean>} groupFlags - Flag values by key, from `useUIFlags`
 * @param {string} bucketKey - Key of the bucket the group sits in
 * @param {{ id: string, code?: string|null }|null} status - The group's status, or null for "No Status"
 * @returns {boolean} True when the group's rows are hidden
 */
export function isStatusGroupCollapsed(groupFlags, bucketKey, status) {
    const isFlagSet = Boolean(groupFlags[getStatusGroupFlagKey(bucketKey, status)]);
    return status?.code === DONE_STATUS_CODE ? !isFlagSet : isFlagSet;
}
