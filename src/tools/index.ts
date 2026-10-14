/**
 * tools/index.ts
 * Tool routing: normalizes names, dispatches to handlers
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  CalendarsToolArgs,
  CalendarToolArgs,
  ListsToolArgs,
  RemindersToolArgs,
  SubtasksToolArgs,
} from '../types/index.js';
import { MESSAGES, TOOLS as TOOL_NAMES } from '../utils/constants.js';
import { TOOLS } from './definitions.js';
import {
  handleCreateCalendarEvent,
  handleCreateReminder,
  handleCreateReminderList,
  handleCreateSubtask,
  handleDeleteCalendarEvent,
  handleDeleteReminder,
  handleDeleteReminderList,
  handleDeleteSubtask,
  handleReadCalendarEvents,
  handleReadCalendars,
  handleReadReminderLists,
  handleReadReminders,
  handleReadSubtasks,
  handleReorderSubtasks,
  handleToggleSubtask,
  handleUpdateCalendarEvent,
  handleUpdateReminder,
  handleUpdateReminderList,
  handleUpdateSubtask,
} from './handlers/index.js';

type ToolArgs =
  | RemindersToolArgs
  | ListsToolArgs
  | SubtasksToolArgs
  | CalendarToolArgs
  | CalendarsToolArgs;

export type ConfirmWrite = (name: string, args: ToolArgs) => Promise<boolean>;

type ToolRouter = (
  args?: ToolArgs,
  confirmWrite?: ConfirmWrite,
) => Promise<CallToolResult>;

type ActionHandler<TArgs extends { action: string }> = (
  args: TArgs,
) => Promise<CallToolResult>;

type RoutedToolName =
  | 'reminders_tasks'
  | 'reminders_lists'
  | 'reminders_subtasks'
  | 'calendar_events';
type ToolName = RoutedToolName | 'calendar_calendars';

/**
 * Creates an action router for tools with multiple actions
 */
const createActionRouter = <TArgs extends ToolArgs>(
  toolName: RoutedToolName,
  handlerMap: Record<TArgs['action'], ActionHandler<TArgs>>,
): ToolRouter => {
  return async (args?: ToolArgs, confirmWrite?: ConfirmWrite) => {
    if (!args) {
      return createErrorResponse('No arguments provided');
    }

    // Bind approval to a snapshot so caller changes during confirmation cannot
    // change the operation that the user reviewed.
    const typedArgs = structuredClone(args) as TArgs;
    const action = typedArgs.action;

    if (!(action in handlerMap)) {
      return createErrorResponse(
        MESSAGES.ERROR.UNKNOWN_ACTION(toolName, String(action)),
      );
    }

    if (action !== 'read') {
      let confirmed = false;
      try {
        confirmed = (await confirmWrite?.(toolName, typedArgs)) === true;
      } catch {
        return createErrorResponse(
          'User confirmation is unavailable. No changes were made. Use a host that supports MCP form elicitation and try again.',
        );
      }
      if (!confirmed) {
        return createErrorResponse(
          'Explicit user confirmation is required for this write. No changes were made.',
        );
      }
    }

    const handler = handlerMap[action as keyof typeof handlerMap];
    return handler(typedArgs);
  };
};

const TOOL_ROUTER_MAP = {
  [TOOL_NAMES.REMINDERS_TASKS]: createActionRouter<RemindersToolArgs>(
    TOOL_NAMES.REMINDERS_TASKS,
    {
      read: (reminderArgs) => handleReadReminders(reminderArgs),
      create: (reminderArgs) => handleCreateReminder(reminderArgs),
      update: (reminderArgs) => handleUpdateReminder(reminderArgs),
      delete: (reminderArgs) => handleDeleteReminder(reminderArgs),
    },
  ),
  [TOOL_NAMES.REMINDERS_LISTS]: createActionRouter<ListsToolArgs>(
    TOOL_NAMES.REMINDERS_LISTS,
    {
      read: () => handleReadReminderLists(),
      create: (listArgs) => handleCreateReminderList(listArgs),
      update: (listArgs) => handleUpdateReminderList(listArgs),
      delete: (listArgs) => handleDeleteReminderList(listArgs),
    },
  ),
  [TOOL_NAMES.REMINDERS_SUBTASKS]: createActionRouter<SubtasksToolArgs>(
    TOOL_NAMES.REMINDERS_SUBTASKS,
    {
      read: (subtaskArgs) => handleReadSubtasks(subtaskArgs),
      create: (subtaskArgs) => handleCreateSubtask(subtaskArgs),
      update: (subtaskArgs) => handleUpdateSubtask(subtaskArgs),
      delete: (subtaskArgs) => handleDeleteSubtask(subtaskArgs),
      toggle: (subtaskArgs) => handleToggleSubtask(subtaskArgs),
      reorder: (subtaskArgs) => handleReorderSubtasks(subtaskArgs),
    },
  ),
  [TOOL_NAMES.CALENDAR_EVENTS]: createActionRouter<CalendarToolArgs>(
    TOOL_NAMES.CALENDAR_EVENTS,
    {
      read: (calendarArgs) => handleReadCalendarEvents(calendarArgs),
      create: (calendarArgs) => handleCreateCalendarEvent(calendarArgs),
      update: (calendarArgs) => handleUpdateCalendarEvent(calendarArgs),
      delete: (calendarArgs) => handleDeleteCalendarEvent(calendarArgs),
    },
  ),
  [TOOL_NAMES.CALENDAR_CALENDARS]: async (args?: ToolArgs) => {
    return handleReadCalendars(args as CalendarsToolArgs | undefined);
  },
} satisfies Record<ToolName, ToolRouter>;

const isManagedToolName = (value: string): value is ToolName =>
  value in TOOL_ROUTER_MAP;

/**
 * Creates an error response with the given message
 */
function createErrorResponse(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export async function handleToolCall(
  name: string,
  args?: ToolArgs,
  confirmWrite?: ConfirmWrite,
): Promise<CallToolResult> {
  if (!isManagedToolName(name)) {
    return createErrorResponse(MESSAGES.ERROR.UNKNOWN_TOOL(name));
  }

  const router = TOOL_ROUTER_MAP[name];
  return router(args, confirmWrite);
}

export { TOOLS };
