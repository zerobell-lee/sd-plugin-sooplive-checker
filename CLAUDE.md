# SOOP Live Checker - Stream Deck Plugin

## Project Overview

This is an Elgato Stream Deck plugin that monitors SOOP (formerly AfreecaTV) streamers and displays their live status on Stream Deck buttons. Each button can be configured to monitor a different streamer and will update its appearance based on whether the streamer is currently live.

**Current Version**: 0.3.0.0

## Technology Stack

- **Language**: TypeScript
- **Build Tool**: Rollup with TypeScript plugin
- **Runtime**: Node.js 20 (embedded in Stream Deck)
- **SDK**: @elgato/streamdeck v1.0.0
- **HTTP Client**: axios v1.7.9
- **Key Dependencies**: set-cookie-parser v2.7.1

## Common Commands

```bash
# Install dependencies (run this first after cloning)
npm install

# Build for production (minified, no source maps)
npm run build

# Development mode (watch + auto-restart + source maps)
npm run watch

# The built plugin is output to:
# com.zerobell-lee.sooplive-checker.sdPlugin/bin/plugin.js
```

## Architecture

### Entry Point
- **src/plugin.ts**: Main entry point that registers actions and connects to Stream Deck

### Core Action
- **src/actions/stream-checker.ts**: The `StreamChecker` class implementing the live status checker
  - Extends `SingletonAction<SoopCheckerSettings>` - ONE instance shared across ALL buttons
  - Uses Map-based state management to track per-button state (critical for multi-button support)

### Key Design Pattern: Per-Context State Management

**CRITICAL**: This plugin uses `SingletonAction`, meaning there's ONE instance managing ALL buttons. To support multiple buttons simultaneously, we use Maps keyed by action context ID:

```typescript
private timers: Map<string, NodeJS.Timeout> = new Map();
private states: Map<string, number> = new Map();
private fetchIntervals: Map<string, number> = new Map();
```

Each button gets its own:
- Timer for periodic API checks
- State (0 = offline, 1 = online)
- Fetch interval (customizable per button)

### SOOP API Integration

**Endpoint**: `https://live.sooplive.co.kr/afreeca/player_live_api.php`

**Request Format**: POST with URL-encoded form data
```typescript
{
  bid: streamer_id,
  quality: "original",
  type: "aid",
  pwd: "",
  stream_type: "common"
}
```

**Response Codes** (CHANNEL.RESULT):
- `0`: Stream offline
- `1`: Stream live (public)
- `-6`: Stream live but restricted (member-only or adult-only)
- Other: Treat as offline

### Lifecycle Hooks

1. **onWillAppear**: Button appears on Stream Deck
   - Registers interval timer for periodic status checks
   - Initial state set to 0 (offline)

2. **onDidReceiveSettings**: User changes settings in Property Inspector
   - Detects fetch_interval changes
   - Restarts timer with new interval if changed

3. **onWillDisappear**: Button removed from Stream Deck
   - Cleans up timer, state, and interval from Maps
   - Prevents memory leaks

4. **onKeyDown**: User presses button
   - Opens streamer's page: `https://play.sooplive.co.kr/{streamer_id}`

5. **onKeyUp**: User releases button
   - Restores correct state (prevents state flickering)

## Settings Schema

```typescript
type SoopCheckerSettings = {
  streamer_id: string;           // SOOP streamer ID
  fetch_interval: string | undefined;  // Check interval in ms (min 1000)
}
```

## Manifest Structure

**Location**: `com.zerobell-lee.sooplive-checker.sdPlugin/manifest.json`

Key fields:
- `Version`: Current version (update on changes)
- `UUID`: `com.zerobell-lee.sooplive-checker`
- `Actions[0].UUID`: `com.zerobell-lee.sooplive-checker.check`
- `States`: Two states (offline/online) with corresponding images

## Important Patterns

### Safe Integer Parsing
Always use `safeParseInt()` for user input to prevent crashes:
```typescript
private safeParseInt(str: string | undefined) {
  if (str === undefined) {
    throw new Error('Invalid number format');
  }
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  } else {
    throw new Error('Invalid number format');
  }
}
```

### Context-Based Cleanup
Always clean up Map entries on `onWillDisappear`:
```typescript
const context = ev.action.id;
const timer = this.timers.get(context);
if (timer) {
  clearInterval(timer);
  this.timers.delete(context);
}
this.states.delete(context);
this.fetchIntervals.delete(context);
```

## Known Issues & History

### Version 0.3.0.0 (Current)
**Fixed**: Multi-button support bug where only the first button would update
**Root Cause**: Single-instance timer/state caused all buttons to share one update cycle
**Solution**: Migrated to Map-based per-context state management

### Version 0.2.0.0 (Dec 14, 2024)
**Issue**: Only first button on Stream Deck would update, subsequent buttons remained static
**Known from user bug report**: "Every button after the first does not update"

## Development Notes

- **Watch Mode**: Uses Stream Deck CLI to auto-restart plugin on file changes
- **Source Maps**: Only available in watch mode, production builds are minified
- **Build Output**: Always goes to `com.zerobell-lee.sooplive-checker.sdPlugin/bin/plugin.js`
- **Testing**: Install plugin via Stream Deck software, use watch mode for development

## Future AI Instance Notes

1. **Never convert SingletonAction to Action** - this would break the existing design
2. **Always use context-based Maps** for any per-button state
3. **Always clean up Map entries** in onWillDisappear to prevent memory leaks
4. **Cookie handling** (line 113-114) is commented out but infrastructure exists for future auth
5. **Fetch interval** must be >= 1000ms to avoid API rate limiting
6. **RESULT === -6** should be treated as "live" (added in recent update)

## Git Repository

**Remote**: git@github.com:zerobell-lee/sd-plugin-sooplive-checker.git
**Main Branch**: main

**IMPORTANT**: Always check git status before making changes. This repository experienced data loss in the past.
