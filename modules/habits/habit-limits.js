// Kept apart from habit-input.js so client code can read them without pulling in the server-side sanitiser
export const DEFAULT_HABIT_COLOR = '#6b7280';
export const DEFAULT_HABIT_CATEGORY_COLOR = '#6b7280';
export const DEFAULT_HABIT_POLARITY = 'build';
export const DEFAULT_HABIT_MEASURE_KIND = 'binary';
export const DEFAULT_HABIT_RECURRENCE = { kind: 'daily' };
export const HABIT_TITLE_MAX = 200;
export const HABIT_DESCRIPTION_MAX = 10000;
export const HABIT_CATEGORY_NAME_MAX = 200;
