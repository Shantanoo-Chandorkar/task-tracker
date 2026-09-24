import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { seedGuestSpace } from '../lib/guest/seed-guest-space.js';
import { GUEST_LIMITS, GUEST_SESSION_MINUTES } from '../lib/guest/guest-config.js';

// Usage: node --env-file=.env.local scripts/verify-guest.mjs [--with-expiry]
//
// Proves the guest protections from migration 0015 against the real database, using throwaway users it creates
// and deletes itself (no credentials needed). Needs Supabase anonymous sign-ins ON and Supabase's own captcha OFF.
// Checks: isolation, every cap and text limit (and that their numbers match lib/guest/guest-config.js), sharing
// and account-conversion blocks, function permissions, and that registered users are not affected.
//
// --with-expiry adds the 30-minute checks. They need one manual step: the script prints an UPDATE for you to run in
// the Supabase SQL editor (the API cannot change auth.users.created_at), then you press Enter.
// Note: the conversion checks ask Supabase to change a throwaway guest's email; the database trigger must refuse
// it before any email is sent, and the address used is on example.com.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const withExpiryStep = process.argv.includes('--with-expiry');

if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error(
        'Missing env. Run: node --env-file=.env.local scripts/verify-guest.mjs [--with-expiry]',
    );
    process.exit(1);
}

const results = [];
const createdUserIds = [];

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

/**
 * Passes when a Supabase call failed with an error whose message contains the given text.
 *
 * @param {{ error: { message: string }|null }} queryResult - Result of a Supabase call.
 * @param {string} expectedText - Text the error message must contain.
 * @returns {{ pass: boolean, detail: string }}
 */
function expectError(queryResult, expectedText) {
    const message = queryResult.error?.message ?? '';
    return {
        pass: message.includes(expectedText),
        detail: queryResult.error ? `error: ${message}` : 'no error, but one was expected',
    };
}

/**
 * Passes when a Supabase call succeeded with no error.
 *
 * @param {{ error: { message: string }|null }} queryResult - Result of a Supabase call.
 * @param {string} successDetail - Text shown when it passes.
 * @returns {{ pass: boolean, detail: string }}
 */
function expectSuccess(queryResult, successDetail) {
    return queryResult.error
        ? { pass: false, detail: `unexpected error: ${queryResult.error.message}` }
        : { pass: true, detail: successDetail };
}

const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

/**
 * Builds a fresh, non-persisting client, so each throwaway user has its own session.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function newClient() {
    return createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}

/**
 * Signs in a new anonymous user and gives it the same sample space the app seeds.
 *
 * @returns {Promise<{ client: object, userId: string }>}
 */
async function createGuest() {
    const client = newClient();
    const { data: signInData, error } = await client.auth.signInAnonymously();
    if (error || !signInData?.user) {
        console.error(`Could not start a guest: ${error?.message}`);
        console.error(
            'Anonymous sign-ins must be ON and Supabase captcha OFF (Authentication settings).',
        );
        await cleanUp();
        process.exit(1);
    }
    createdUserIds.push(signInData.user.id);
    await seedGuestSpace(adminClient, signInData.user.id);
    return { client, userId: signInData.user.id };
}

/**
 * Creates a confirmed registered user through the admin API and signs it in.
 *
 * @returns {Promise<{ client: object, userId: string, password: string }>}
 */
async function createRegisteredUser() {
    const email = `verify-guest-${randomUUID()}@example.com`;
    const password = `Pw-${randomUUID()}`;
    const { data: createdUser, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (error) {
        console.error(`Could not create a registered test user: ${error.message}`);
        await cleanUp();
        process.exit(1);
    }
    createdUserIds.push(createdUser.user.id);

    const client = newClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) {
        console.error(`Could not sign the registered test user in: ${signInError.message}`);
        await cleanUp();
        process.exit(1);
    }
    return { client, userId: createdUser.user.id, password };
}

/**
 * Deletes every throwaway user; their rows go with them through ON DELETE CASCADE.
 */
async function cleanUp() {
    for (const userId of createdUserIds) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    }
}

/**
 * Counts the rows a client can see in a table.
 *
 * @param {object} client - Supabase client.
 * @param {string} tableName - Table to count.
 * @returns {Promise<number>}
 */
async function countVisibleRows(client, tableName) {
    const { count } = await client.from(tableName).select('id', { count: 'exact', head: true });
    return count ?? 0;
}

/**
 * Reads a guest's seeded space, lists and tasks with the admin client (which sees every row).
 *
 * @param {string} userId - The guest's user id.
 * @returns {Promise<{ spaceId: string, lists: object[], tasks: object[] }>}
 */
async function loadSeededData(userId) {
    const { data: space } = await adminClient
        .from('spaces')
        .select('id')
        .eq('owner_id', userId)
        .single();
    const { data: lists } = await adminClient.from('lists').select('id').eq('space_id', space.id);
    const { data: tasks } = await adminClient
        .from('tasks')
        .select('id, title, list_id')
        .in(
            'list_id',
            lists.map((list) => list.id),
        );
    return { spaceId: space.id, lists, tasks };
}

const taskRow = (listId, statusId, index, extra = {}) => ({
    title: `verify ${index}`,
    list_id: listId,
    status_id: statusId,
    position: 1000 + index,
    depth: 0,
    ...extra,
});

let guestOne;
let guestTwo;
let registeredOne;
let registeredTwo;

try {
    guestOne = await createGuest();
    guestTwo = await createGuest();
    registeredOne = await createRegisteredUser();
    registeredTwo = await createRegisteredUser();

    const { data: guestOneSpace } = await guestOne.client.from('spaces').select('id').single();
    const { data: guestOneLists } = await guestOne.client
        .from('lists')
        .select('id')
        .order('position');
    const { data: guestOneStatuses } = await guestOne.client
        .from('statuses')
        .select('id')
        .order('position');
    const guestTwoSeed = await loadSeededData(guestTwo.userId);
    const guestTwoTasks = guestTwoSeed.tasks;
    const guestTwoSpaceId = guestTwoSeed.spaceId;
    const firstListId = guestOneLists[0].id;
    const firstStatusId = guestOneStatuses[0].id;

    // ---------- Isolation ----------
    await check('A guest sees its own seeded data', async () => {
        const visibleTasks = await countVisibleRows(guestOne.client, 'tasks');
        return { pass: visibleTasks > 0, detail: `${visibleTasks} tasks visible` };
    });

    await check("A guest cannot see another guest's tasks, lists or space", async () => {
        const { data: otherTasks } = await guestOne.client
            .from('tasks')
            .select('id')
            .in(
                'id',
                guestTwoTasks.map((task) => task.id),
            );
        const { data: otherSpace } = await guestOne.client
            .from('spaces')
            .select('id')
            .eq('id', guestTwoSpaceId);
        return {
            pass: otherTasks.length === 0 && otherSpace.length === 0,
            detail: `${otherTasks.length} tasks, ${otherSpace.length} spaces visible`,
        };
    });

    await check(
        "A guest cannot change or delete another guest's task (0 rows affected, data unchanged)",
        async () => {
            const target = guestTwoTasks[0];
            const { data: updatedRows } = await guestOne.client
                .from('tasks')
                .update({ title: 'hacked' })
                .eq('id', target.id)
                .select();
            const { data: deletedRows } = await guestOne.client
                .from('tasks')
                .delete()
                .eq('id', target.id)
                .select();
            const { data: unchanged } = await adminClient
                .from('tasks')
                .select('title')
                .eq('id', target.id)
                .single();
            return {
                pass:
                    updatedRows.length === 0 &&
                    deletedRows.length === 0 &&
                    unchanged.title === target.title,
                detail: `updated ${updatedRows.length}, deleted ${deletedRows.length}, title now "${unchanged.title}"`,
            };
        },
    );

    const { data: registeredOneSpace, error: registeredSpaceError } = await registeredOne.client
        .from('spaces')
        .insert({
            name: 'verify space',
            color: '#000000',
            position: 0,
            owner_id: registeredOne.userId,
        })
        .select()
        .single();

    await check(
        "A guest cannot see a registered user's space, and a registered user cannot see a guest's",
        async () => {
            if (registeredSpaceError)
                return { pass: false, detail: `setup failed: ${registeredSpaceError.message}` };
            const { data: seenByGuest } = await guestOne.client
                .from('spaces')
                .select('id')
                .eq('id', registeredOneSpace.id);
            const { data: seenByRegistered } = await registeredOne.client
                .from('spaces')
                .select('id')
                .eq('id', guestTwoSpaceId);
            return {
                pass: seenByGuest.length === 0 && seenByRegistered.length === 0,
                detail: `${seenByGuest.length} and ${seenByRegistered.length} rows visible`,
            };
        },
    );

    // ---------- Text limits (before the caps are filled, so the text rule is what fires) ----------
    await check('Text limit: a 201-character task title is refused for a guest', async () =>
        expectError(
            await guestOne.client
                .from('tasks')
                .insert(taskRow(firstListId, firstStatusId, 1, { title: 'a'.repeat(201) })),
            'GUEST_LIMIT_REACHED:text',
        ),
    );

    await check('Text limit: a 10001-character description is refused for a guest', async () =>
        expectError(
            await guestOne.client
                .from('tasks')
                .insert(taskRow(firstListId, firstStatusId, 2, { description: 'a'.repeat(10001) })),
            'GUEST_LIMIT_REACHED:text',
        ),
    );

    await check('Text limit: a recurrence rule over 2000 bytes is refused for a guest', async () =>
        expectError(
            await guestOne.client.from('tasks').insert(
                taskRow(firstListId, firstStatusId, 3, {
                    is_recurring: true,
                    recurrence_rule: { freq: 'DAILY', padding: 'a'.repeat(2100) },
                }),
            ),
            'GUEST_LIMIT_REACHED:text',
        ),
    );

    await check('Text limit: a 201-character list name is refused for a guest', async () =>
        expectError(
            await guestOne.client
                .from('lists')
                .insert({ name: 'a'.repeat(201), space_id: guestOneSpace.id, position: 50 }),
            'GUEST_LIMIT_REACHED:text',
        ),
    );

    await check(
        'Text limit: updating an existing task title to 201 characters is refused',
        async () => {
            const { data: someTask } = await guestOne.client
                .from('tasks')
                .select('id')
                .limit(1)
                .single();
            return expectError(
                await guestOne.client
                    .from('tasks')
                    .update({ title: 'a'.repeat(201) })
                    .eq('id', someTask.id),
                'GUEST_LIMIT_REACHED:text',
            );
        },
    );

    // ---------- Caps (filled up to the number in guest-config.js, so SQL and JS numbers must agree) ----------
    await check(`Cap: exactly ${GUEST_LIMITS.spaces} space, a second is refused`, async () =>
        expectError(
            await guestOne.client.from('spaces').insert({
                name: 'second',
                color: '#000000',
                position: 5,
                owner_id: guestOne.userId,
            }),
            'GUEST_LIMIT_REACHED:spaces',
        ),
    );

    await check(
        `Cap: lists fill to exactly ${GUEST_LIMITS.lists}, the next is refused`,
        async () => {
            const existingLists = await countVisibleRows(guestOne.client, 'lists');
            const rowsToAdd = Array.from(
                { length: GUEST_LIMITS.lists - existingLists },
                (_, index) => ({
                    name: `verify list ${index}`,
                    space_id: guestOneSpace.id,
                    position: 100 + index,
                }),
            );
            if (rowsToAdd.length > 0) {
                const fillResult = await guestOne.client.from('lists').insert(rowsToAdd);
                if (fillResult.error)
                    return {
                        pass: false,
                        detail: `filling to the cap failed: ${fillResult.error.message}`,
                    };
            }
            return expectError(
                await guestOne.client
                    .from('lists')
                    .insert({ name: 'over', space_id: guestOneSpace.id, position: 999 }),
                'GUEST_LIMIT_REACHED:lists',
            );
        },
    );

    await check(
        `Cap: sublists fill to exactly ${GUEST_LIMITS.sublists}, the next is refused`,
        async () => {
            const existingSublists = await countVisibleRows(guestOne.client, 'sublists');
            const rowsToAdd = Array.from(
                { length: GUEST_LIMITS.sublists - existingSublists },
                (_, index) => ({
                    name: `verify sublist ${index}`,
                    list_id: firstListId,
                    position: 100 + index,
                }),
            );
            if (rowsToAdd.length > 0) {
                const fillResult = await guestOne.client.from('sublists').insert(rowsToAdd);
                if (fillResult.error)
                    return {
                        pass: false,
                        detail: `filling to the cap failed: ${fillResult.error.message}`,
                    };
            }
            return expectError(
                await guestOne.client
                    .from('sublists')
                    .insert({ name: 'over', list_id: firstListId, position: 999 }),
                'GUEST_LIMIT_REACHED:sublists',
            );
        },
    );

    await check(
        `Cap: statuses fill to exactly ${GUEST_LIMITS.statuses}, the next is refused`,
        async () => {
            const existingStatuses = await countVisibleRows(guestOne.client, 'statuses');
            const rowsToAdd = Array.from(
                { length: GUEST_LIMITS.statuses - existingStatuses },
                (_, index) => ({
                    name: `verify status ${index}`,
                    color: '#123456',
                    position: 100 + index,
                    space_id: guestOneSpace.id,
                }),
            );
            if (rowsToAdd.length > 0) {
                const fillResult = await guestOne.client.from('statuses').insert(rowsToAdd);
                if (fillResult.error)
                    return {
                        pass: false,
                        detail: `filling to the cap failed: ${fillResult.error.message}`,
                    };
            }
            return expectError(
                await guestOne.client.from('statuses').insert({
                    name: 'over',
                    color: '#123456',
                    position: 999,
                    space_id: guestOneSpace.id,
                }),
                'GUEST_LIMIT_REACHED:statuses',
            );
        },
    );

    await check(
        `Cap: tasks fill to exactly ${GUEST_LIMITS.tasks}, the next is refused`,
        async () => {
            const existingTasks = await countVisibleRows(guestOne.client, 'tasks');
            const rowsToAdd = Array.from(
                { length: GUEST_LIMITS.tasks - existingTasks },
                (_, index) => taskRow(firstListId, firstStatusId, 10 + index),
            );
            if (rowsToAdd.length > 0) {
                const fillResult = await guestOne.client.from('tasks').insert(rowsToAdd);
                if (fillResult.error)
                    return {
                        pass: false,
                        detail: `filling to the cap failed: ${fillResult.error.message}`,
                    };
            }
            return expectError(
                await guestOne.client
                    .from('tasks')
                    .insert(taskRow(firstListId, firstStatusId, 999)),
                'GUEST_LIMIT_REACHED:tasks',
            );
        },
    );

    // ---------- Sharing ----------
    await check(
        "Sharing: a guest cannot send a join request to a registered user's space",
        async () =>
            expectError(
                await guestOne.client.from('space_collaborators').insert({
                    space_id: registeredOneSpace.id,
                    user_id: guestOne.userId,
                    requester_email: 'guest@example.com',
                }),
                'row-level security',
            ),
    );

    await check(
        "Sharing: a registered user cannot send a join request to a guest's space",
        async () =>
            expectError(
                await registeredOne.client.from('space_collaborators').insert({
                    space_id: guestTwoSpaceId,
                    user_id: registeredOne.userId,
                    requester_email: 'a@example.com',
                }),
                'row-level security',
            ),
    );

    await check(
        "Sharing (regression): a registered user CAN still request to join another registered user's space",
        async () => {
            const { data: registeredTwoSpace } = await registeredTwo.client
                .from('spaces')
                .insert({
                    name: 'verify space two',
                    color: '#000000',
                    position: 0,
                    owner_id: registeredTwo.userId,
                })
                .select()
                .single();
            const joinResult = await registeredOne.client.from('space_collaborators').insert({
                space_id: registeredTwoSpace.id,
                user_id: registeredOne.userId,
                requester_email: 'a@example.com',
            });
            return expectSuccess(joinResult, 'request created');
        },
    );

    // ---------- Account conversion ----------
    await check('Conversion: a guest cannot add an email address (stays anonymous)', async () => {
        const changeResult = await guestOne.client.auth.updateUser({
            email: `verify-convert-${randomUUID()}@example.com`,
        });
        const { data: adminView } = await adminClient.auth.admin.getUserById(guestOne.userId);
        const stillAnonymous = adminView.user.is_anonymous === true && !adminView.user.email;
        return {
            pass: Boolean(changeResult.error) && stillAnonymous,
            detail: `error: ${changeResult.error?.message ?? 'none'}; still anonymous: ${stillAnonymous}`,
        };
    });

    await check('Conversion: a guest cannot set a password', async () => {
        const changeResult = await guestOne.client.auth.updateUser({
            password: `Pw-${randomUUID()}`,
        });
        const { data: adminView } = await adminClient.auth.admin.getUserById(guestOne.userId);
        return {
            pass: Boolean(changeResult.error) && adminView.user.is_anonymous === true,
            detail: `error: ${changeResult.error?.message ?? 'none'}`,
        };
    });

    await check(
        'Conversion (database trigger): even the admin API cannot give a guest an email or password',
        async () => {
            // The admin API skips Supabase's own guest rules, so only the trigger from migration 0015 can refuse these
            const triggerGuest = await createGuest();
            const emailResult = await adminClient.auth.admin.updateUserById(triggerGuest.userId, {
                email: `verify-trigger-${randomUUID()}@example.com`,
                email_confirm: true,
            });
            const passwordResult = await adminClient.auth.admin.updateUserById(
                triggerGuest.userId,
                {
                    password: `Pw-${randomUUID()}`,
                },
            );
            const { data: adminView } = await adminClient.auth.admin.getUserById(
                triggerGuest.userId,
            );
            const unchanged = adminView.user.is_anonymous === true && !adminView.user.email;
            return {
                pass: Boolean(emailResult.error) && Boolean(passwordResult.error) && unchanged,
                detail: `email change: ${emailResult.error?.message ?? 'ALLOWED'}; password change: ${passwordResult.error?.message ?? 'ALLOWED'}; unchanged: ${unchanged}`,
            };
        },
    );

    await check(
        'Conversion (regression): a guest can still refresh its session and stays a guest',
        async () => {
            const { data: refreshed, error } = await guestOne.client.auth.refreshSession();
            if (error) return { pass: false, detail: error.message };
            return { pass: refreshed.user?.is_anonymous === true, detail: 'session refreshed' };
        },
    );

    await check(
        'Conversion (regression): a registered user can still change their own password and sign in with it',
        async () => {
            const newPassword = `New-${randomUUID()}`;
            const changeResult = await registeredOne.client.auth.updateUser({
                password: newPassword,
            });
            if (changeResult.error) return { pass: false, detail: changeResult.error.message };
            const { data: userView } = await adminClient.auth.admin.getUserById(
                registeredOne.userId,
            );
            const { error: signInError } = await newClient().auth.signInWithPassword({
                email: userView.user.email,
                password: newPassword,
            });
            return expectSuccess({ error: signInError }, 'password changed, new password works');
        },
    );

    // ---------- Function permissions and config agreement ----------
    await check('Functions: a guest cannot run the purge function', async () =>
        expectError(await guestOne.client.rpc('purge_expired_guests'), 'permission denied'),
    );

    await check('Functions: a logged-out visitor cannot call the helper functions', async () =>
        expectError(await newClient().rpc('is_guest'), 'permission denied'),
    );

    await check('Functions: the purge refuses a tiny age that would delete live guests', async () =>
        expectError(
            await adminClient.rpc('purge_expired_guests', { max_age_minutes: 1 }),
            'at least 5',
        ),
    );

    await check(
        `Config: the database session length equals GUEST_SESSION_MINUTES (${GUEST_SESSION_MINUTES})`,
        async () => {
            const { data: databaseMinutes, error } =
                await guestTwo.client.rpc('guest_session_minutes');
            if (error) return { pass: false, detail: error.message };
            return {
                pass: databaseMinutes === GUEST_SESSION_MINUTES,
                detail: `database says ${databaseMinutes}`,
            };
        },
    );

    // ---------- Registered users are not affected by any guest rule ----------
    await check(
        'Regression: a registered user has no caps (70 tasks, 4 lists, 2 spaces, 12 statuses)',
        async () => {
            const { data: list } = await registeredOne.client
                .from('lists')
                .insert({ name: 'verify list', space_id: registeredOneSpace.id, position: 0 })
                .select()
                .single();
            const { data: status } = await registeredOne.client
                .from('statuses')
                .select('id')
                .eq('space_id', registeredOneSpace.id)
                .limit(1)
                .single();
            const problems = [];
            const tasksResult = await registeredOne.client
                .from('tasks')
                .insert(
                    Array.from({ length: 70 }, (_, index) => taskRow(list.id, status.id, index)),
                );
            if (tasksResult.error) problems.push(`tasks: ${tasksResult.error.message}`);
            const listsResult = await registeredOne.client.from('lists').insert(
                Array.from({ length: 3 }, (_, index) => ({
                    name: `extra ${index}`,
                    space_id: registeredOneSpace.id,
                    position: 10 + index,
                })),
            );
            if (listsResult.error) problems.push(`lists: ${listsResult.error.message}`);
            const spaceResult = await registeredOne.client.from('spaces').insert({
                name: 'second space',
                color: '#000000',
                position: 1,
                owner_id: registeredOne.userId,
            });
            if (spaceResult.error) problems.push(`space: ${spaceResult.error.message}`);
            const statusResult = await registeredOne.client.from('statuses').insert(
                Array.from({ length: 9 }, (_, index) => ({
                    name: `s${index}`,
                    color: '#123456',
                    position: 20 + index,
                    space_id: registeredOneSpace.id,
                })),
            );
            if (statusResult.error) problems.push(`statuses: ${statusResult.error.message}`);
            return {
                pass: problems.length === 0,
                detail: problems.join('; ') || 'all inserts allowed',
            };
        },
    );

    await check(
        'Regression: a registered user has no text limit (250-character title, 12000-character description)',
        async () => {
            const { data: list } = await registeredOne.client
                .from('lists')
                .select('id')
                .eq('space_id', registeredOneSpace.id)
                .limit(1)
                .single();
            const { data: status } = await registeredOne.client
                .from('statuses')
                .select('id')
                .eq('space_id', registeredOneSpace.id)
                .limit(1)
                .single();
            const longResult = await registeredOne.client.from('tasks').insert(
                taskRow(list.id, status.id, 5000, {
                    title: 'a'.repeat(250),
                    description: 'b'.repeat(12000),
                }),
            );
            return expectSuccess(longResult, 'long text stored');
        },
    );

    await check('Regression: a registered user can still edit their profile', async () => {
        const profileResult = await registeredOne.client
            .from('profiles')
            .update({ display_name: 'Verify User' })
            .eq('id', registeredOne.userId)
            .select();
        return {
            pass: !profileResult.error && profileResult.data.length === 1,
            detail: profileResult.error?.message ?? 'profile updated',
        };
    });

    // ---------- Expiry ----------
    if (withExpiryStep) {
        const expiringGuest = await createGuest();
        const expiringSeed = await loadSeededData(expiringGuest.userId);

        await check('Expiry (control): a live guest can read its data', async () => {
            const visibleTasks = await countVisibleRows(expiringGuest.client, 'tasks');
            return { pass: visibleTasks > 0, detail: `${visibleTasks} tasks visible` };
        });

        console.log('\nRun this in the Supabase SQL editor, then press Enter here:\n');
        console.log(
            `  UPDATE auth.users SET created_at = now() - interval '${GUEST_SESSION_MINUTES + 1} minutes' WHERE id = '${expiringGuest.userId}';\n`,
        );
        const readline = createInterface({ input: process.stdin, output: process.stdout });
        await readline.question('Press Enter when done... ');
        readline.close();

        await check(
            'Expiry: an expired guest can no longer read its tasks, lists or profile, even with a valid token',
            async () => {
                const visibleTasks = await countVisibleRows(expiringGuest.client, 'tasks');
                const visibleLists = await countVisibleRows(expiringGuest.client, 'lists');
                const visibleProfiles = await countVisibleRows(expiringGuest.client, 'profiles');
                return {
                    pass: visibleTasks === 0 && visibleLists === 0 && visibleProfiles === 0,
                    detail: `${visibleTasks} tasks, ${visibleLists} lists, ${visibleProfiles} profiles visible`,
                };
            },
        );

        await check('Expiry: an expired guest can no longer write', async () =>
            expectError(
                await expiringGuest.client
                    .from('tasks')
                    .insert(taskRow(expiringSeed.lists[0].id, firstStatusId, 1)),
                'row-level security',
            ),
        );

        await check(
            'Expiry (control): a live guest and a registered user are unaffected',
            async () => {
                const liveGuestTasks = await countVisibleRows(guestTwo.client, 'tasks');
                const registeredTasks = await countVisibleRows(registeredOne.client, 'tasks');
                return {
                    pass: liveGuestTasks > 0 && registeredTasks > 0,
                    detail: `${liveGuestTasks} guest tasks, ${registeredTasks} registered tasks visible`,
                };
            },
        );

        await check(
            'Purge: removes the expired guest and its data, and leaves live guests and registered users',
            async () => {
                const { data: purgedCount, error } = await adminClient.rpc('purge_expired_guests');
                if (error) return { pass: false, detail: error.message };
                const { data: expiredLookup } = await adminClient.auth.admin.getUserById(
                    expiringGuest.userId,
                );
                const { data: leftoverSpaces } = await adminClient
                    .from('spaces')
                    .select('id')
                    .eq('owner_id', expiringGuest.userId);
                const { data: liveLookup } = await adminClient.auth.admin.getUserById(
                    guestTwo.userId,
                );
                const { data: registeredLookup } = await adminClient.auth.admin.getUserById(
                    registeredOne.userId,
                );
                return {
                    pass:
                        purgedCount >= 1 &&
                        !expiredLookup?.user &&
                        leftoverSpaces.length === 0 &&
                        Boolean(liveLookup.user) &&
                        Boolean(registeredLookup.user),
                    detail: `purged ${purgedCount}; expired user gone: ${!expiredLookup?.user}; leftover spaces: ${leftoverSpaces.length}`,
                };
            },
        );
    } else {
        results.push({
            label: 'Expiry and purge checks',
            pass: true,
            detail: 'SKIPPED (run with --with-expiry to include them)',
        });
    }
} finally {
    await cleanUp();
}

console.log('\nGuest protection verification\n');
for (const { label, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${detail}`);
}
const failedCount = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failedCount}/${results.length} passed`);
process.exit(failedCount === 0 ? 0 : 1);
