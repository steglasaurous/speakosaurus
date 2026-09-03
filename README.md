# Speakosaurus

Speakosaurus is a text-to-speech chat reader for Twitch (and other platforms supported by Streamer.bot), with custom voice support and per-user management.

## Features

- Reads chat messages aloud, with **trigger**, **always**, or **off** modes
- Configurable trigger commands (defaults: `!s`, `!"`, `!say`)
- Multiple TTS providers: system voices, bundled Piper, ElevenLabs, Azure Speech, and TTS Monster
- Custom voices with per-voice tweaks, plus a voice playground to preview them
- Per-user settings: assigned voice, spoken name, pronouns, custom intros, and welcome on/off
- First-word welcome intros, with optional Streamer.bot actions
- Word replacements, ignored users, and pronoun-based default voices
- Status bar with connection state, render/play queues, stop, and quick mode switching

## Requirements

- [Streamer.bot](https://streamer.bot) installed, running, and connected to your broadcast account
- Streamer.bot **WebSocket Server** enabled

To enable the WebSocket server in Streamer.bot: **Servers/Clients → WebSocket Server**, enable **Auto Start**, then click **Start Server**. The default URL is `ws://localhost:8080`.

## Install

Download the latest release for your platform from the [Releases](../../releases/latest) page.

## Initial setup

On first launch, a short setup wizard walks you through connecting to Streamer.bot.

1. Confirm Streamer.bot is running and the WebSocket server is started.
2. Enter the WebSocket URL if it differs from `ws://localhost:8080`.
3. Check the status bar — **Streamer.bot** should show **Connected**.
4. Optionally configure additional TTS providers in Settings. System voices work out of the box; Piper can be enabled without an API key. ElevenLabs, Azure Speech, and TTS Monster need their own credentials.

You can change the Streamer.bot URL, TTS providers, and other options later from Settings.

> [!NOTE]
> Found a bug or have a concern? Please [open an issue](../../issues).
