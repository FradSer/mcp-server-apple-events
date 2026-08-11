#!/bin/bash

# macOS permission check and request helper
# For the Apple Events MCP Server

echo "Checking Apple Events MCP Server permissions..."

# Mirror the MCP server's spawn path: when the event-disclaim TCC shim is
# present, run `event` through it so the binary is its own TCC-responsible
# process and the Reminders/Calendar prompt appears even inside GUI MCP
# clients that ship no EventKit usage strings (issue #93).
if [[ -x ./bin/event-disclaim ]]; then
    EVENT=(./bin/event-disclaim ./bin/event)
else
    EVENT=(./bin/event)
fi

# Without the shim, TCC attributes prompts to the parent GUI app — warn when
# that parent is not a regular terminal.
if [[ ! -x ./bin/event-disclaim ]]; then
    PARENT_PID=$(ps -o ppid= -p $$ | xargs)
    if [[ -n "$PARENT_PID" ]]; then
        CUR=$PARENT_PID
        while [[ -n "$CUR" && $CUR -gt 1 ]]; do
            # `comm=` returns the executable path without arguments, so app
            # paths containing spaces (e.g. "Claude Desktop.app") stay intact.
            PATH_TO_PID=$(ps -o comm= -p $CUR 2>/dev/null)
            if [[ "$PATH_TO_PID" == *".app/"* ]]; then
                APP_NAME=$(echo "$PATH_TO_PID" | tr '/' '\n' | grep '\.app$' | head -n 1)
                if [[ -n "$APP_NAME" ]]; then
                    # Check if it's a known terminal
                    if [[ ! "$APP_NAME" =~ ^(Terminal|iTerm|Warp|Ghostty|WezTerm|Alacritty|kitty)\.app$ ]]; then
                        echo "================================================================================"
                        echo "WARNING: Running within GUI context of parent application: $APP_NAME"
                        echo "macOS TCC (Privacy) attributes permission prompts to $APP_NAME."
                        echo "If $APP_NAME lacks calendar/reminder usage descriptions or entitlements,"
                        echo "permission prompts will fail immediately."
                        echo "FIX: rebuild with 'pnpm build' to produce bin/event-disclaim, or run this"
                        echo "script from a native Terminal window instead."
                        echo "================================================================================"
                        echo ""
                    fi
                fi
                break
            fi
            NEXT_CUR=$(ps -o ppid= -p $CUR 2>/dev/null | xargs)
            if [[ "$NEXT_CUR" == "$CUR" ]]; then
                break
            fi
            CUR=$NEXT_CUR
        done
    fi
fi

# Check EventKit permissions
echo "Checking EventKit (Reminders) permission..."
EVENTKIT_CHECK=$("${EVENT[@]}" reminders list --json 2>&1)
if [[ $? -eq 0 ]]; then
    echo "EventKit permission granted."
else
    echo "EventKit permission denied or requires authorization."
    echo "Grant access in: System Settings > Privacy & Security > Reminders"
    echo "Run this script again after granting access."
    exit 1
fi

echo "Checking EventKit (Calendars) permission..."
CALENDAR_CHECK=$("${EVENT[@]}" calendar list --json 2>&1)
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
