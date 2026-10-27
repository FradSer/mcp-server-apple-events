import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CliUserError } from '../utils/errorHandling.js';
import { executeEventCliJson } from '../utils/eventCli.js';
import { createServer } from './server.js';

jest.mock('../utils/eventCli.js');

const execute = jest.mocked(executeEventCliJson);

describe('reminder recurrence through MCP', () => {
  it('passes create, replace, and clear through validation and preserves JSON output', async () => {
    const server = createServer({ name: 'recurrence', version: '1' });
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const rule = {
      frequency: 'weekly',
      interval: 2,
      daysOfWeek: ['Monday', 'Wednesday'],
      occurrenceCount: 4,
    };
    const fixture = {
      id: 'r1',
      title: 'Repeat',
      isCompleted: false,
      list: 'Inbox',
      notes: null,
      url: null,
      dueDate: '2027-01-01',
      priority: 0,
      recurrenceRules: [rule],
    };
    execute.mockReset();
    execute.mockResolvedValue(fixture);
    try {
      await server.connect(b);
      await client.connect(a);
      const created = await client.callTool({
        name: 'reminders_tasks',
        arguments: {
          action: 'create',
          title: 'Repeat',
          dueDate: '2027-01-01',
          recurrence: rule,
        },
      });
      expect(created.isError).toBeFalsy();
      expect(execute).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          'reminders',
          'create',
          '--recurrence=weekly',
          '--recurrence-interval=2',
          '--recurrence-days=Monday,Wednesday',
          '--recurrence-count=4',
        ]),
      );
      expect(created.structuredContent).toMatchObject({
        records: [{ recurrenceRules: [rule] }],
      });
      const mirror = (
        created.content as Array<{ type: string; text?: string }>
      ).find((item) => item.text?.startsWith('{'));
      expect(JSON.parse(mirror?.text ?? '')).toEqual(created.structuredContent);
      const monthly = {
        frequency: 'monthly',
        interval: 1,
        daysOfMonth: [1, 15],
      };
      execute.mockResolvedValueOnce({ ...fixture, recurrenceRules: [monthly] });
      const updated = await client.callTool({
        name: 'reminders_tasks',
        arguments: {
          action: 'update',
          id: 'r1',
          recurrence: { frequency: 'monthly', daysOfMonth: [1, 15] },
        },
      });
      expect(updated.isError).toBeFalsy();
      expect(execute).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          'reminders',
          'update',
          '--recurrence=monthly',
          '--recurrence-days-of-month=1,15',
        ]),
      );
      expect(updated.structuredContent).toMatchObject({
        records: [{ recurrenceRules: [monthly] }],
      });
      const updatedMirror = (updated.content as Array<{ text?: string }>).find(
        (item) => item.text?.startsWith('{'),
      );
      expect(JSON.parse(updatedMirror?.text ?? '')).toEqual(
        updated.structuredContent,
      );
      execute.mockResolvedValueOnce({ ...fixture, recurrenceRules: [] });
      const cleared = await client.callTool({
        name: 'reminders_tasks',
        arguments: { action: 'update', id: 'r1', clearRecurrence: true },
      });
      expect(cleared.isError).toBeFalsy();
      expect(execute).toHaveBeenLastCalledWith(
        expect.arrayContaining(['reminders', 'update', '--clear-recurrence']),
      );
      expect(cleared.structuredContent).toMatchObject({
        records: [{ recurrenceRules: [] }],
      });
      const clearedMirror = (cleared.content as Array<{ text?: string }>).find(
        (item) => item.text?.startsWith('{'),
      );
      expect(JSON.parse(clearedMirror?.text ?? '')).toEqual(
        cleared.structuredContent,
      );
      execute.mockRejectedValueOnce(
        new CliUserError('A repeat rule needs a due date; set --due as well.'),
      );
      const missingDue = await client.callTool({
        name: 'reminders_tasks',
        arguments: {
          action: 'update',
          id: 'r1',
          recurrence: { frequency: 'daily' },
        },
      });
      expect(missingDue.isError).toBe(true);
      expect(JSON.stringify(missingDue.content)).toContain('needs a due date');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
