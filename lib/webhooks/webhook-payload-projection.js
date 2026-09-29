export const PAYLOAD_LEVELS = ['minimal', 'standard', 'full'];

/**
 * Keeps only the id of a `{ id, ... }` reference object, passing null through.
 *
 * @param {{ id: string }|null|undefined} reference - Status, list or sublist reference from the stored snapshot.
 * @returns {{ id: string }|null} Id-only reference.
 */
function toIdOnly(reference) {
    return reference ? { id: reference.id } : null;
}

/**
 * Projects the stored task snapshot down to what a payload level may reveal.
 *
 * @param {object|null} taskSnapshot - Frozen snapshot stored with the event, null when there is no single root.
 * @param {string} payloadLevel - 'minimal' | 'standard' | 'full'.
 * @returns {object|null} The task as the receiver should see it.
 */
function projectTask(taskSnapshot, payloadLevel) {
    if (!taskSnapshot) return null;
    if (payloadLevel === 'full') return taskSnapshot;
    if (payloadLevel === 'standard') {
        const { description: _description, ...taskWithoutDescription } = taskSnapshot;
        return taskWithoutDescription;
    }
    return {
        id: taskSnapshot.id,
        parent_id: taskSnapshot.parent_id,
        status: toIdOnly(taskSnapshot.status),
        list: toIdOnly(taskSnapshot.list),
        sublist: toIdOnly(taskSnapshot.sublist),
    };
}

/**
 * Projects the old/new change map: values are shown from 'standard' up, descriptions only at 'full'.
 *
 * @param {object|null} changes - Map of field name to `{ old, new }` from the stored payload.
 * @param {string} payloadLevel - 'minimal' | 'standard' | 'full'.
 * @returns {object|null} The changes a receiver may see, null at 'minimal' or when nothing changed.
 */
function projectChanges(changes, payloadLevel) {
    if (!changes || payloadLevel === 'minimal') return null;
    if (payloadLevel === 'full') return changes;
    const { description: _description, ...changesWithoutDescription } = changes;
    return changesWithoutDescription;
}

/**
 * Projects the effects block; at 'minimal' the per-task titles are replaced by bare ids.
 *
 * @param {object|null} effects - `{ kind, count, truncated, tasks[] }` from the stored payload.
 * @param {string} payloadLevel - 'minimal' | 'standard' | 'full'.
 * @returns {object|null} The effects a receiver may see.
 */
function projectEffects(effects, payloadLevel) {
    if (!effects || payloadLevel !== 'minimal') return effects ?? null;
    const { tasks, ...effectsSummary } = effects;
    return {
        ...effectsSummary,
        tasks: (tasks ?? []).map((affectedTask) => ({ id: affectedTask.id })),
    };
}

/**
 * Projects the context block; at 'minimal' list names are dropped, ids stay.
 *
 * @param {object|null} context - `{ duplicated_from }` or `{ list }` from the stored payload.
 * @param {string} payloadLevel - 'minimal' | 'standard' | 'full'.
 * @returns {object|null} The context a receiver may see.
 */
function projectContext(context, payloadLevel) {
    if (!context || payloadLevel !== 'minimal') return context ?? null;
    return context.list ? { ...context, list: toIdOnly(context.list) } : context;
}

/**
 * Builds the JSON body for one event at one endpoint's payload level. The outbox stores the full snapshot once;
 * the level is applied here, per delivery, so a level change takes effect for queued events too.
 * An unknown level falls back to 'minimal' so a bad value can never reveal more than intended.
 *
 * @param {{ id: string, event_type: string, schema_version: number, occurred_at: string, correlation_id: string,
 *   space_id: string, actor_id: string|null, source: string, resource_type: string, resource_id: string,
 *   payload: object }} event - A `webhook_events` row.
 * @param {string} payloadLevel - The endpoint's payload level.
 * @returns {object} The envelope to JSON-encode and sign.
 */
export function projectEventForEndpoint(event, payloadLevel) {
    const safeLevel = PAYLOAD_LEVELS.includes(payloadLevel) ? payloadLevel : 'minimal';
    const storedPayload = event.payload ?? {};
    const changedFields = Object.keys(storedPayload.changes ?? {});

    return {
        event_id: event.id,
        event_type: event.event_type,
        schema_version: event.schema_version,
        occurred_at: event.occurred_at,
        correlation_id: event.correlation_id,
        space_id: event.space_id,
        actor_id: event.actor_id,
        source: event.source,
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        data: {
            task: projectTask(storedPayload.task, safeLevel),
            changed_fields: changedFields,
            changes: projectChanges(storedPayload.changes, safeLevel),
            effects: projectEffects(storedPayload.effects, safeLevel),
            context: projectContext(storedPayload.context, safeLevel),
            affected_count: storedPayload.affected_count ?? null,
        },
    };
}
