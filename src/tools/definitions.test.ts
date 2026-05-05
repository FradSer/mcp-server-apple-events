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

    it('should expose EventKit-aligned fields for reminders and events', () => {
      const remindersTool = TOOLS.find(
        (tool) => tool.name === 'reminders_tasks',
      );
      const remindersProps = remindersTool?.inputSchema.properties ?? {};

      // EKReminder / EKCalendarItem alignment
      expect(remindersProps).toHaveProperty('startDate');
      expect(remindersProps).toHaveProperty('completionDate');
      expect(remindersProps).toHaveProperty('location');
      expect(remindersProps).toHaveProperty('alarms');
      expect(remindersProps).toHaveProperty('clearAlarms');
      expect(remindersProps).toHaveProperty('recurrenceRules');

      const calendarEventsTool = TOOLS.find(
        (tool) => tool.name === 'calendar_events',
      );
      const calendarProps = calendarEventsTool?.inputSchema.properties ?? {};

      // EKEvent / EKCalendarItem alignment
      expect(calendarProps).toHaveProperty('availability');
      expect(calendarProps).toHaveProperty('structuredLocation');
      expect(calendarProps).toHaveProperty('alarms');
      expect(calendarProps).toHaveProperty('clearAlarms');
      expect(calendarProps).toHaveProperty('recurrenceRules');
      expect(calendarProps).toHaveProperty('clearRecurrence');
      expect(calendarProps).toHaveProperty('span');
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
      expect(calendarProps).toHaveProperty('filterAccount');
    });
  });
});
