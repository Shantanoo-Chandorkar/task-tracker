import { createClient } from '@supabase/supabase-js';

// Usage: node --env-file=.env.local scripts/reassign-space-owner.mjs <fromOwnerId> <toOwnerId>
// Uses the admin client because the SQL Editor has no auth.uid(), so the owner-only RLS policy rejects this UPDATE.

const [fromOwnerId, toOwnerId] = process.argv.slice(2);
if (!fromOwnerId || !toOwnerId) {
    console.error(
        'Usage: node --env-file=.env.local scripts/reassign-space-owner.mjs <fromOwnerId> <toOwnerId>',
    );
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, secretKey);

const { data: spacesBeforeReassign, error: beforeError } = await supabase
    .from('spaces')
    .select('id, name, owner_id')
    .eq('owner_id', fromOwnerId);

if (beforeError) {
    console.error('Failed to read spaces:', beforeError.message);
    process.exit(1);
}

console.log(`Spaces currently owned by ${fromOwnerId}:`, spacesBeforeReassign);

if (spacesBeforeReassign.length === 0) {
    console.log('Nothing to reassign.');
    process.exit(0);
}

// Lists, sublists, tasks and statuses derive ownership through space_id, so this one UPDATE moves them all
const { data: reassignedSpaces, error: updateError } = await supabase
    .from('spaces')
    .update({ owner_id: toOwnerId })
    .eq('owner_id', fromOwnerId)
    .select('id, name, owner_id');

if (updateError) {
    console.error('Reassignment failed:', updateError.message);
    process.exit(1);
}

console.log(`Reassigned ${reassignedSpaces.length} space(s) to ${toOwnerId}:`, reassignedSpaces);
