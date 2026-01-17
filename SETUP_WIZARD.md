# Setup Wizard Implementation

## Overview
A first-time setup wizard has been added to guide users through the initial configuration of SpeakManager.

## Features

### Setup Steps

1. **StreamerBot Configuration** (Step 1)
   - Configure the StreamerBot WebSocket URL
   - Informational text explaining that StreamerBot is required
   - Link to streamer.bot website for downloads
   - Default value pre-filled: `ws://localhost:8080`

2. **TTS Providers Information** (Step 2)
   - Informs user that the default system TTS engine is already configured
   - Provides option to configure additional TTS providers (ElevenLabs, Azure, TTS Monster)
   - Two choices:
     - "Configure TTS Providers Now" - Takes user to Settings → TTS Providers tab
     - "Skip for Now" - Takes user to main app (Users page)

## Implementation Details

### Backend Changes

**File:** `apps/desktop/src/app/services/settings.service.ts`
- Added `SETUP_COMPLETED` setting to track if initial setup has been completed
- Setting is in the "Internal" group (hidden from UI)
- Default value: `false`

### Frontend Changes

**New Component:** `apps/client/src/app/components/setup-wizard/`
- `setup-wizard.component.ts` - Main wizard logic
- `setup-wizard.component.html` - Wizard UI with progress indicator
- `setup-wizard.component.scss` - Beautiful gradient styling
- `setup-wizard.component.spec.ts` - Unit tests

**App Component:** `apps/client/src/app/app.ts`
- Added `OnInit` implementation
- Checks `setupCompleted` setting on app initialization
- Redirects to `/setup` if setup not completed
- Monitors navigation events to ensure setup is completed

**Settings Component:** `apps/client/src/app/components/settings/settings.component.ts`
- Added support for URL query parameters (`?tab=TTS Providers`)
- Filters out "Internal" settings group from UI display
- Allows setup wizard to deep-link to specific settings tabs

**Routes:** `apps/client/src/app/app.routes.ts`
- Added `/setup` route for the setup wizard

## User Flow

1. **First Launch:**
   - App checks if `setupCompleted` setting is `true`
   - If not, user is redirected to `/setup`
   - User cannot access other pages until setup is completed

2. **During Setup:**
   - User progresses through 2 steps
   - Step 1: Configure StreamerBot URL (saved before proceeding)
   - Step 2: Choose whether to configure TTS providers now or later

3. **Completing Setup:**
   - `setupCompleted` setting is set to `true`
   - User is redirected to either:
     - Settings page (TTS Providers tab) if they chose to configure providers
     - Users page if they chose to skip

4. **Subsequent Launches:**
   - Setup check passes, user goes directly to main app
   - No setup wizard interference

## UI Design

The wizard features:
- Clean, modern card-based design
- Purple gradient background
- Progress indicator showing current step
- Clear step navigation (Back/Next buttons)
- Icon-based visual communication
- Responsive layout
- Informational boxes with helpful context
- Direct link to streamer.bot website

## Testing

To test the setup wizard:
1. Delete or reset the `setupCompleted` setting in the database
2. Restart the app
3. The setup wizard should appear automatically
4. Complete the setup flow
5. Verify you're redirected to the correct page based on your choice

## Future Enhancements

Possible improvements:
- Add validation for WebSocket URL format
- Test connection to StreamerBot in the wizard
- Add more setup steps for other critical settings
- Add "Reset Setup" option in settings for troubleshooting
- Add analytics to track which options users choose
