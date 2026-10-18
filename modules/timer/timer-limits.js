// Kept apart from template-input.js so client code can read these without pulling in server-side validation.
export const TIMER_TEMPLATE_NAME_MAX = 200;
export const TEMPLATE_BLOCK_KINDS = ['work', 'break'];
export const TEMPLATE_BLOCK_LABEL_MAX = 100;
export const TEMPLATE_BLOCK_MAX_COUNT = 20;
export const TEMPLATE_BLOCK_MIN_DURATION_SECONDS = 60;
export const TEMPLATE_BLOCK_MAX_DURATION_SECONDS = 14400;

// Plain data pre-filling the create-template form (decision 17) - not a special-cased code path.
export const POMODORO_PRESET_NAME = 'Pomodoro';
export const POMODORO_PRESET_BLOCKS = [
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Short break', durationSeconds: 300 },
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Short break', durationSeconds: 300 },
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Short break', durationSeconds: 300 },
    { kind: 'work', label: 'Focus', durationSeconds: 1500 },
    { kind: 'break', label: 'Long break', durationSeconds: 900 },
];
