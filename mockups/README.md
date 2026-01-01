# Speak Manager UI Mockups

This directory contains HTML mockups for the Speak Manager application UI.

## Viewing the Mockups

Open `index.html` in your web browser to see a navigation page with links to all three mockups:

1. **Users List** (`users-list.html`) - Searchable list of users
2. **User Detail** (`user-detail.html`) - Edit user voice, TTS name, and custom intros
3. **Settings** (`settings.html`) - Configure application settings

## Features Demonstrated

### Users List Page
- ✅ Searchable/filterable user list
- ✅ Display of user information (Twitch username, TTS name, voice assignment, intro count)
- ✅ Visual indicators for voice assignments
- ✅ Clickable user items for navigation to detail page

### User Detail Page
- ✅ Voice selection with autocomplete dropdown
- ✅ Voice results grouped by provider name (ElevenLabs, SpeakerTTS, etc.)
- ✅ Alphabetically sorted voice results
- ✅ TTS name editing
- ✅ Multiple custom intro text blocks
- ✅ Add/remove intro functionality
- ✅ Save changes button

### Settings Page
- ✅ Mode selection dropdown
- ✅ Default voice selection with autocomplete (grouped by provider)
- ✅ Trigger commands management (add/remove commands)
- ✅ Save settings functionality

## Design Notes

- **Color Scheme**: Uses a modern, clean design with Apple-inspired colors
- **Typography**: System font stack for native feel
- **Spacing**: Generous padding and margins for readability
- **Interactions**: Hover states and transitions for better UX
- **Responsive**: Designed to work on various screen sizes

## Implementation Notes

These are static HTML mockups. When implementing in Angular:

1. The autocomplete dropdowns will need JavaScript/Angular logic to:
   - Filter voices based on search input
   - Group results by provider
   - Sort alphabetically
   - Handle selection

2. The search functionality will need to:
   - Filter users in real-time as user types
   - Search across Twitch username and TTS name fields

3. Form validation and API integration will need to be added

4. Navigation between pages will use Angular Router


