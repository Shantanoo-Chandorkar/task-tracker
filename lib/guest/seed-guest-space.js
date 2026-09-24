import { randomUUID } from 'node:crypto';

const GUEST_SPACE_NAME = 'Guest Playground';
const GUEST_SPACE_COLOR = '#3b82f6';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// The daily recurrence cron spawns copies once next_occurrence has passed; keeping it days away means guests never get any
const RECURRENCE_FIRST_RUN_DAYS = 2;

const SAMPLE_LISTS = [
    { key: 'launch', name: 'Product Launch', color: '#3b82f6' },
    { key: 'personal', name: 'Personal', color: '#f59e0b' },
];

const SAMPLE_SUBLISTS = [
    { key: 'design', listKey: 'launch', name: 'Design', color: '#a855f7' },
    { key: 'engineering', listKey: 'launch', name: 'Engineering', color: '#10b981' },
];

// Root tasks name their list (and sublist); subtasks inherit both from their parent. `dueInDays` is from today.
const SAMPLE_TASKS = [
    {
        listKey: 'launch',
        sublistKey: 'design',
        title: 'Design landing page',
        status: 'in_progress',
        isPrioritised: true,
        dueInDays: 2,
        description:
            '<p>Drag a task by its handle to reorder it. Starred tasks float to the top.</p>',
        children: [
            { title: 'Sketch wireframes', status: 'done' },
            {
                title: 'Pick a colour palette',
                status: 'todo',
                children: [{ title: 'Check contrast ratios', status: 'todo' }],
            },
        ],
    },
    {
        listKey: 'launch',
        sublistKey: 'design',
        title: 'Write hero copy',
        status: 'todo',
        dueInDays: 5,
    },
    {
        listKey: 'launch',
        sublistKey: 'engineering',
        title: 'Ship v1.0',
        status: 'todo',
        isPrioritised: true,
        dueInDays: 7,
        children: [
            { title: 'Set up CI pipeline', status: 'done' },
            { title: 'Write release notes', status: 'in_progress' },
        ],
    },
    {
        listKey: 'launch',
        sublistKey: 'engineering',
        title: 'Fix login redirect bug',
        status: 'todo',
    },
    {
        listKey: 'launch',
        title: 'Weekly team sync',
        status: 'todo',
        description: '<p>A recurring task: complete it and the next one is scheduled for you.</p>',
        recurrenceRule: { freq: 'WEEKLY', interval: 1, byweekday: ['MO'] },
    },
    {
        listKey: 'personal',
        title: 'Plan weekend trip',
        status: 'todo',
        isPrioritised: true,
        dueInDays: 3,
        children: [
            { title: 'Book train tickets', status: 'todo' },
            { title: 'Pack bags', status: 'todo' },
        ],
    },
    {
        listKey: 'personal',
        title: 'Read 20 pages',
        status: 'todo',
        recurrenceRule: { freq: 'DAILY', interval: 1 },
    },
    { listKey: 'personal', title: 'Buy groceries', status: 'done' },
];

/**
 * Turns a number of days from today into a YYYY-MM-DD date string.
 *
 * @param {Date} today - The reference day.
 * @param {number} days - Days to add.
 * @returns {string} ISO date without a time.
 */
function toDueDate(today, days) {
    return new Date(today.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Builds every row of the sample content for one guest space. Pure, so its shape can be tested without a database.
 *
 * @param {object} args
 * @param {string} args.spaceId - Id of the guest's space.
 * @param {Object<string, string>} args.statusIdByCode - Status ids keyed by code ('todo', 'in_progress', 'done').
 * @param {Date} [args.now] - Current time; only tests pass this.
 * @returns {{ lists: object[], sublists: object[], tasks: object[] }} Rows ready to insert, ids already assigned.
 */
export function buildGuestSeed({ spaceId, statusIdByCode, now = new Date() }) {
    const listIdByKey = new Map();
    const lists = SAMPLE_LISTS.map((sampleList, listPosition) => {
        const id = randomUUID();
        listIdByKey.set(sampleList.key, id);
        return {
            id,
            space_id: spaceId,
            name: sampleList.name,
            color: sampleList.color,
            position: listPosition,
        };
    });

    const sublistIdByKey = new Map();
    const sublistCountByListKey = new Map();
    const sublists = SAMPLE_SUBLISTS.map((sampleSublist) => {
        const id = randomUUID();
        sublistIdByKey.set(sampleSublist.key, id);
        const sublistPosition = sublistCountByListKey.get(sampleSublist.listKey) ?? 0;
        sublistCountByListKey.set(sampleSublist.listKey, sublistPosition + 1);
        return {
            id,
            list_id: listIdByKey.get(sampleSublist.listKey),
            name: sampleSublist.name,
            color: sampleSublist.color,
            position: sublistPosition,
        };
    });

    const tasks = [];
    const nextPositionByGroup = new Map();

    function addTask(sampleTask, { listId, sublistId, parentId, depth }) {
        const groupKey = parentId ?? `root:${listId}:${sublistId}`;
        const position = (nextPositionByGroup.get(groupKey) ?? 0) + 1;
        nextPositionByGroup.set(groupKey, position);

        const id = randomUUID();
        tasks.push({
            id,
            title: sampleTask.title,
            description: sampleTask.description ?? null,
            status_id: statusIdByCode[sampleTask.status],
            list_id: listId,
            sublist_id: sublistId,
            parent_id: parentId,
            depth,
            position,
            due_date:
                sampleTask.dueInDays === undefined ? null : toDueDate(now, sampleTask.dueInDays),
            is_prioritised: Boolean(sampleTask.isPrioritised),
            is_recurring: Boolean(sampleTask.recurrenceRule),
            recurrence_rule: sampleTask.recurrenceRule ?? null,
            next_occurrence: sampleTask.recurrenceRule
                ? new Date(now.getTime() + RECURRENCE_FIRST_RUN_DAYS * MS_PER_DAY).toISOString()
                : null,
        });

        for (const childTask of sampleTask.children ?? []) {
            // A subtask never belongs to a sublist directly, so only its root carries the sublist id
            addTask(childTask, { listId, sublistId: null, parentId: id, depth: depth + 1 });
        }
    }

    for (const sampleTask of SAMPLE_TASKS) {
        addTask(sampleTask, {
            listId: listIdByKey.get(sampleTask.listKey),
            sublistId: sampleTask.sublistKey ? sublistIdByKey.get(sampleTask.sublistKey) : null,
            parentId: null,
            depth: 0,
        });
    }

    return { lists, sublists, tasks };
}

/**
 * Inserts a full sample space for a new guest. Throws on the first failed insert, so the caller can delete the
 * half-built guest.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient - Secret-key client (bypasses RLS).
 * @param {string} ownerId - The guest's user id.
 * @returns {Promise<void>}
 * @throws {Error} When any insert or lookup fails.
 */
export async function seedGuestSpace(adminClient, ownerId) {
    const spaceId = randomUUID();

    const { error: spaceError } = await adminClient.from('spaces').insert({
        id: spaceId,
        name: GUEST_SPACE_NAME,
        color: GUEST_SPACE_COLOR,
        position: 0,
        owner_id: ownerId,
    });
    if (spaceError) throw new Error(`space insert failed: ${spaceError.message}`);

    // The on_space_created trigger has just added the default statuses
    const { data: statusRows, error: statusError } = await adminClient
        .from('statuses')
        .select('id, code')
        .eq('space_id', spaceId);
    if (statusError) throw new Error(`status lookup failed: ${statusError.message}`);

    const statusIdByCode = Object.fromEntries(
        (statusRows ?? [])
            .filter((statusRow) => statusRow.code)
            .map((statusRow) => [statusRow.code, statusRow.id]),
    );
    if (!statusIdByCode.todo || !statusIdByCode.in_progress || !statusIdByCode.done) {
        throw new Error('default statuses missing for the new space');
    }

    const { lists, sublists, tasks } = buildGuestSeed({ spaceId, statusIdByCode });

    const { error: listsError } = await adminClient.from('lists').insert(lists);
    if (listsError) throw new Error(`lists insert failed: ${listsError.message}`);

    const { error: sublistsError } = await adminClient.from('sublists').insert(sublists);
    if (sublistsError) throw new Error(`sublists insert failed: ${sublistsError.message}`);

    // One insert for every task: parents and children arrive together, so their ids are generated up front
    const { error: tasksError } = await adminClient.from('tasks').insert(tasks);
    if (tasksError) throw new Error(`tasks insert failed: ${tasksError.message}`);
}
