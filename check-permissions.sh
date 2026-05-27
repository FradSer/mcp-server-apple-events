#!/bin/bash

# macOS permission check and request helper
# For the Apple Events MCP Server

echo "Checking Apple Events MCP Server permissions..."

# Check EventKit permissions
echo "Checking EventKit (Reminders) permission..."
EVENTKIT_CHECK=$(./bin/EventKitCLI --action read --limit 1 2>&1)
if [[ $? -eq 0 ]]; then
    echo "EventKit permission granted."
else
    echo "EventKit permission denied or requires authorization."
    echo "Grant access in: System Settings > Privacy & Security > Reminders"
    echo "Run this script again after granting access."
    exit 1
fi

echo "Checking EventKit (Calendars) permission..."
CALENDAR_CHECK=$(./bin/EventKitCLI --action read-calendars 2>&1)
if [[ $? -eq 0 ]]; then
    echo "Calendar permission granted."
else
    echo "Calendar permission denied or requires authorization."
    echo "Grant Full Calendar Access in: System Settings > Privacy & Security > Calendars"
    echo "Run this script again after granting access."
    exit 1
fi

# Check AppleScript Automation permission
echo "Checking AppleScript Automation permission..."
APPLESCRIPT_CHECK=$(osascript -e 'tell application "Reminders" to get the name of every list' 2>&1)
if [[ $? -eq 0 ]]; then
    echo "AppleScript Automation permission granted."
    echo "Available reminder lists: $APPLESCRIPT_CHECK"
else
    echo "AppleScript Automation permission denied or requires authorization."
    echo "Note: Automation permission is granted to the tool running this script (for example, a terminal or MCP client)."
    echo "Grant access in: System Settings > Privacy & Security > Automation"
    echo "Run this script again after granting access."
    exit 1
fi

echo ""
echo "All permission checks passed."
echo "Apple Events MCP Server is ready to run."
echo ""
echo "Start command: npx $HOME/.mcp-server/mcp-server-apple-events"
