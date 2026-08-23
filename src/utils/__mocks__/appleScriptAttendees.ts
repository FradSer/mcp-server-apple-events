export const addAttendeesToEvent = jest.fn();
export class AppleScriptAttendeeError extends Error {}
export class EventNotFoundError extends AppleScriptAttendeeError {}
export class AmbiguousEventError extends AppleScriptAttendeeError {}
