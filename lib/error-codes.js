/**
 * Generic, cross-domain error codes for space/list/sublist/task/status auth guards -- kept
 * separate from lib/auth/error-codes.js, whose codes are specific to the sign-up/in/out flow.
 */
export const NOT_AUTHENTICATED = 'NOT_AUTHENTICATED';
export const TASK_INVALID_PRIORITY = 'TASK_INVALID_PRIORITY';
export const HOME_LOAD_FAILED = 'HOME_LOAD_FAILED';
export const SPACE_NOT_FOUND = 'SPACE_NOT_FOUND';
export const ALREADY_MEMBER = 'ALREADY_MEMBER';
export const REQUEST_NOT_FOUND = 'REQUEST_NOT_FOUND';
export const PERMISSION_READ_ONLY = 'PERMISSION_READ_ONLY';
export const PERMISSION_RESTRICTED_NOT_OWN = 'PERMISSION_RESTRICTED_NOT_OWN';
export const PERMISSION_NOT_A_MEMBER = 'PERMISSION_NOT_A_MEMBER';
