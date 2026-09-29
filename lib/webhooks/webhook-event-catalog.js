/** Event types an endpoint may subscribe to; `webhook.test` is deliberately absent because it is never subscribed. */
export const TASK_EVENT_TYPES = [
    'task.created',
    'task.updated',
    'task.status_changed',
    'task.completed',
    'task.uncompleted',
    'task.priority_changed',
    'task.due_date_changed',
    'task.moved',
    'task.deleted',
];

// `task.*` matches every task event, including ones added later; emit_event resolves it by the type's first segment
export const SUBSCRIBABLE_EVENT_TYPES = [...TASK_EVENT_TYPES, 'task.*'];
