# Speak Manager UI Mockups

This directory contains HTML mockups for the Speak Manager application UI.

## Viewing the Mockups

Open `index.html` in your web browser to see a navigation page with links to all mockups:

1. **Users List** (`users-list.html`) - Searchable list of users
2. **User Detail** (`user-detail.html`) - Edit user voice, TTS name, and custom intros
3. **Settings** (`settings.html`) - Configure application settings
4. **Voice Picker — Modal (A)** (`voice-picker-modal.html`) - Full voice browser dialog
5. **Voice Picker — Panel (B)** (`voice-picker-panel.html`) - Anchored filter panel
6. **Voice Playground** (`voice-playground.html`) - Status-bar modal: embedded picker, sample text, provider-aware tweaks, save to Custom. Three scenes (Azure, ElevenLabs, saved custom).

## Voice picker concepts

Both concepts fix the current autocomplete trap: the selected voice’s display name is no longer used as the search query when opening the picker. Search starts empty; the current selection is shown separately.

Shared features in A and B:

- Voices grouped by provider (collapsible)
- Sidebar **Provider** nav (All / Favourites / each provider) for quick jumps
- Provider-agnostic **Favourites** group at the top when browsing all
- Filters: language (`en-US`, `en-GB`, …), unassigned-only, tags (gender / pitch / style)
- Preview play button and star-to-favourite
- Orange indicator when a voice is assigned to another user

| | Concept A — Modal | Concept B — Panel |
|---|---|---|
| Layout | Dialog with filter sidebar | Dropdown panel under the field |
| Filters | Always-visible sidebar | Compact chips + language select |
| Selection | Explicit **Select voice** | Click row to apply immediately |
| Best for | Long browse / many providers | Quick swaps in Settings forms |

**Note:** Language and tags are aspirational in the mock data — today’s `Voice` model does not yet expose them (providers often have this metadata but discard it). Favourites would be new client/desktop persistence.

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

### Voice Playground
- ✅ Status-bar playground button next to Settings
- ✅ Two-pane modal: embedded voice picker + tweak panel
- ✅ Sample text played by per-row / selected-voice play buttons
- ✅ Shared controls (speed, pitch, volume) plus per-provider extras
- ✅ Custom category (Favourites-style), custom pill, save / update / delete
- ✅ Custom voices can still be favourited

## Design Notes

- **Color Scheme**: Uses a modern, clean design with Apple-inspired colors
- **Typography**: System font stack for native feel
- **Spacing**: Generous padding and margins for readability
- **Interactions**: Hover states and transitions for better UX
- **Responsive**: Designed to work on various screen sizes

## Implementation Notes

These are static HTML mockups. When implementing in Angular:

1. Keep **display value** and **search query** as separate state (do not seed search from the selected voice name on focus).

2. Extend the voice model / provider mapping for `language`, `tags`, and assignment usage; persist favourites (e.g. settings or local store).

3. Form validation and API integration will need to be added.

4. Navigation between pages will use Angular Router.
