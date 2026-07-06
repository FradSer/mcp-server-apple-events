/**
 * Tests for tools/definitions.ts
 */

import { TOOLS } from './definitions.js';

describe('Tools Definitions', () => {
  describe('TOOLS export', () => {
    it.each([
      {
        name: 'reminders_tasks',
        description: 'Manages reminder tasks',
        actions: ['read', 'create', 'update', 'delete'],
      },
      {
        name: 'reminders_lists',
        description: 'Manages reminder lists',
        actions: ['read', 'create', 'update', 'delete'],
      },
      {
        name: 'calendar_events',
        description: 'Manages calendar events',
        actions: ['read', 'create', 'update', 'delete'],
      },
      {
        name: 'calendar_calendars',
        description: 'Reads calendar collections',
        actions: ['read'],
      },
    ])('should define $name tool with correct schema and actions', ({
      name,
      description,
      actions,
    }) => {
      const tool = TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.description).toContain(description);
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');

      const actionEnum = (
        tool?.inputSchema.properties?.action as
          | { enum?: readonly string[] }
          | undefined
      )?.enum;
      expect(actionEnum).toEqual(actions);
    });

    it('should have correct dueWithin options enum', () => {
      const remindersTool = TOOLS.find(
        (tool) => tool.name === 'reminders_tasks',
      );
      const dueWithinEnum = (
        remindersTool?.inputSchema.properties?.dueWithin as
          | { enum?: readonly string[] }
          | undefined
      )?.enum;
      expect(dueWithinEnum).toEqual([
        'today',
        'tomorrow',
        'this-week',
        'overdue',
        'no-date',
      ]);
    });

    it('exposes the event-CLI-supported reminder and event fields', () => {
      const remindersTool = TOOLS.find(
        (tool) => tool.name === 'reminders_tasks',
      );
      const remindersProps = remindersTool?.inputSchema.properties ?? {};

      // Reminder write fields still wired through `event reminders create|update`
      expect(remindersProps).toHaveProperty('startDate');
      expect(remindersProps).toHaveProperty('dueDate');
      expect(remindersProps).toHaveProperty('priority');
      expect(remindersProps).toHaveProperty('tags');
      expect(remindersProps).toHaveProperty('subtasks');

      const calendarEventsTool = TOOLS.find(
        (tool) => tool.name === 'calendar_events',
      );
      const calendarProps = calendarEventsTool?.inputSchema.properties ?? {};

      // Calendar write fields still wired through `event calendar create|update`
      expect(calendarProps).toHaveProperty('location');
      expect(calendarProps).toHaveProperty('note');
      expect(calendarProps).toHaveProperty('targetCalendar');
      expect(calendarProps).toHaveProperty('span');
      // availability stays as a read-only TS-side filter.
      expect(calendarProps).toHaveProperty('availability');
    });

    it('drops fields the `event` CLI cannot write', () => {
      const remindersTool = TOOLS.find(
        (tool) => tool.name === 'reminders_tasks',
      );
      const remindersProps = remindersTool?.inputSchema.properties ?? {};
      for (const removed of [
        'completionDate',
        'location',
        'alarms',
        'clearAlarms',
        'recurrence',
        'recurrenceRules',
        'clearRecurrence',
        'locationTrigger',
        'clearLocationTrigger',
      ]) {
        expect(remindersProps).not.toHaveProperty(removed);
      }

      const calendarEventsTool = TOOLS.find(
        (tool) => tool.name === 'calendar_events',
      );
      const calendarProps = calendarEventsTool?.inputSchema.properties ?? {};
      for (const removed of [
        'alarms',
        'clearAlarms',
        'recurrenceRules',
        'clearRecurrence',
        'structuredLocation',
        'url',
        'isAllDay',
        'filterAccount',
      ]) {
        expect(calendarProps).not.toHaveProperty(removed);
      }

      const remindersListsTool = TOOLS.find(
        (tool) => tool.name === 'reminders_lists',
      );
      const listProps = remindersListsTool?.inputSchema.properties ?? {};
      expect(listProps).not.toHaveProperty('color');
    });

    it('should enforce tool name pattern compliance', () => {
      const pattern = /^[a-zA-Z0-9_-]+$/;
      const invalidTool = TOOLS.find((tool) => !pattern.test(tool.name));
      expect(invalidTool).toBeUndefined();
    });

    it('should document default read date window behavior for calendar events', () => {
      const calendarEventsTool = TOOLS.find(
        (tool) => tool.name === 'calendar_events',
      );
      const startDateDescription = (
        calendarEventsTool?.inputSchema.properties?.startDate as
          | { description?: string }
          | undefined
      )?.description;
      const endDateDescription = (
        calendarEventsTool?.inputSchema.properties?.endDate as
          | { description?: string }
          | undefined
      )?.description;

      expect(startDateDescription).toContain('defaults to today');
      expect(endDateDescription).toContain('defaults to today + 14 days');
    });

    it('should expose optional date range filters for calendar collections', () => {
      const calendarsTool = TOOLS.find(
        (tool) => tool.name === 'calendar_calendars',
      );
      const calendarProps = calendarsTool?.inputSchema.properties ?? {};

      expect(calendarProps).toHaveProperty('startDate');
      expect(calendarProps).toHaveProperty('endDate');
      // `event` has no EventKit account info to filter by.
      expect(calendarProps).not.toHaveProperty('filterAccount');
    });
  });
});
