import { createClient } from '@supabase/supabase-js';

// Usage: node --env-file=.env.local scripts/verify-bucket4.mjs <ownerEmail> <ownerPassword> <memberEmail> <memberPassword>
// Both accounts must already exist (sign up first if needed). Credentials are passed as args,
// not hardcoded here, so this tracked file never carries them.
//
// Proves space_collaborators' RLS shape end-to-end with two real, signed-in accounts --
// isolation before a request, self-join/cross-owner-approve blocked, access granted after
// approval, and revoked after removal.

const [ownerEmail, ownerPassword, memberEmail, memberPassword] = process.argv.slice(2);
if (!ownerEmail || !ownerPassword || !memberEmail || !memberPassword) {
    console.error(
        'Usage: node --env-file=.env.local scripts/verify-bucket4.mjs <ownerEmail> <ownerPassword> <memberEmail> <memberPassword>',
    );
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const results = [];

/**
 * Runs one check, records its pass/fail outcome, and never throws past this call.
 *
 * @param {string} label - Human-readable name shown in the report.
 * @param {() => Promise<{ pass: boolean, detail: string }>} runCheck - The check itself.
 */
async function check(label, runCheck) {
    try {
        const { pass, detail } = await runCheck();
        results.push({ label, pass, detail });
    } catch (error) {
        results.push({ label, pass: false, detail: `threw: ${error.message}` });
    }
}

const adminClient = createClient(supabaseUrl, secretKey);
const ownerClient = createClient(supabaseUrl, publishableKey);
const memberClient = createClient(supabaseUrl, publishableKey);

const { data: ownerAuth, error: ownerSignInError } = await ownerClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
});
const { data: memberAuth, error: memberSignInError } = await memberClient.auth.signInWithPassword({
    email: memberEmail,
    password: memberPassword,
});
if (ownerSignInError || memberSignInError) {
    console.error('Sign-in failed:', ownerSignInError?.message || memberSignInError?.message);
    process.exit(1);
}

let spaceId = null;
let requestId = null;

await check('Owner can create a temp space', async () => {
    const { data: createdSpace, error } = await ownerClient
        .from('spaces')
        .insert({ name: '__verify-bucket4-temp__', owner_id: ownerAuth.user.id, position: 9999 })
        .select()
        .single();
    if (error) return { pass: false, detail: error.message };
    spaceId = createdSpace.id;
    return { pass: true, detail: `space ${spaceId} created` };
});

await check('Before any request, member sees ZERO rows for the space', async () => {
    const { data: visibleRows } = await memberClient.from('spaces').select('id').eq('id', spaceId);
    return {
        pass: (visibleRows ?? []).length === 0,
        detail: `${visibleRows?.length ?? 0} row(s) visible`,
    };
});

await check("Owner can't self-join their own space (RLS WITH CHECK)", async () => {
    const { error } = await ownerClient
        .from('space_collaborators')
        .insert({ space_id: spaceId, user_id: ownerAuth.user.id, requester_email: ownerEmail });
    return {
        pass: Boolean(error),
        detail: error ? `blocked: ${error.message}` : 'insert unexpectedly succeeded',
    };
});

await check('Member can request to join', async () => {
    const { data: createdRequest, error } = await memberClient
        .from('space_collaborators')
        .insert({ space_id: spaceId, user_id: memberAuth.user.id, requester_email: memberEmail })
        .select()
        .single();
    if (error) return { pass: false, detail: error.message };
    requestId = createdRequest.id;
    return { pass: true, detail: `request ${requestId} created, status=${createdRequest.status}` };
});

await check("Member can't approve their own request (RLS owner-only UPDATE)", async () => {
    const { data: updatedRows } = await memberClient
        .from('space_collaborators')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .select();
    return {
        pass: (updatedRows ?? []).length === 0,
        detail: `${updatedRows?.length ?? 0} row(s) updated`,
    };
});

await check('Owner can approve the request', async () => {
    const { data: updatedRows, error } = await ownerClient
        .from('space_collaborators')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .select();
    if (error) return { pass: false, detail: error.message };
    return {
        pass: updatedRows.length === 1 && updatedRows[0].status === 'accepted',
        detail: JSON.stringify(updatedRows[0]),
    };
});

await check('After approval, member can see and write to the space', async () => {
    const { data: visibleSpace } = await memberClient
        .from('spaces')
        .select('id')
        .eq('id', spaceId)
        .maybeSingle();
    if (!visibleSpace) return { pass: false, detail: 'space not visible to member' };

    const { data: createdList, error } = await memberClient
        .from('lists')
        .insert({ name: '__verify-bucket4-list__', space_id: spaceId, position: 0 })
        .select()
        .single();
    if (error) return { pass: false, detail: `list insert failed: ${error.message}` };
    return { pass: true, detail: `list ${createdList.id} created by member` };
});

await check('Owner can remove the collaborator', async () => {
    const { data: deletedRows, error } = await ownerClient
        .from('space_collaborators')
        .delete()
        .eq('id', requestId)
        .select();
    if (error) return { pass: false, detail: error.message };
    return { pass: deletedRows.length === 1, detail: `${deletedRows.length} row(s) deleted` };
});

await check('After removal, member sees ZERO rows for the space again', async () => {
    const { data: visibleRows } = await memberClient.from('spaces').select('id').eq('id', spaceId);
    return {
        pass: (visibleRows ?? []).length === 0,
        detail: `${visibleRows?.length ?? 0} row(s) visible`,
    };
});

// Admin cleanup regardless of pass/fail above -- deletes cascade lists/collaborators.
if (spaceId) await adminClient.from('spaces').delete().eq('id', spaceId);
await ownerClient.auth.signOut();
await memberClient.auth.signOut();

console.log('\nBucket 4 verification\n----------------------');
let allPassed = true;
for (const { label, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
    if (!pass) allPassed = false;
}
console.log('----------------------');
console.log(allPassed ? 'All automated checks passed.' : 'Some checks failed -- see above.');
console.log(`
Remaining manual QA (needs a live Next.js server, real Brevo credentials):
  - Request to join via the /spaces UI, confirm the owner receives exactly one email.
  - Open a copied join link (?join=...) on a fresh session, confirm the dialog pre-fills.
  - Approve/reject from the Sharing section, confirm the requester receives the matching email.
  - Confirm StatusManager still works (create/delete a status) from both an owner and a
    collaborator's card, and that Settings no longer references it.
`);
process.exit(allPassed ? 0 : 1);
