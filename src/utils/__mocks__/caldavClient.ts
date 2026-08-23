export const request = jest.fn();
export const assertAllowedCalDavUrl = jest.fn();
export const parseScheduleStatus = jest.fn(() => []);
export class CalDavError extends Error {}
export class CalDavAuthError extends CalDavError {}
export class CalDavConflictError extends CalDavError {}
