# SpeakManager

An app to provide TTS to twitch streams (or anything supported by streamerbot)

## Requirements

- Streamer.bot running and connected to you broadcast account
- Streamer.bot websocket server enabled

# Pronouns notes

https://api.pronouns.alejo.io/v1/users/omnidreamer_
- API call to get stuff.

# TODO

- [ ] Design how mods can connect and use app (API bridge?)
- [ ] Voicelist: Create filters that can help pair down the voice selection
  - [ ] azure voices: add filters for locale, gender
  - [ ] groups: add ability to "roll up" groups, make it easier to find voices in other groups by scrolling
- [ ] for API keys, create documentation on how to get them for each service
  - [ ] Azure
  - [ ] Elevenlabs
  - [ ] tts.monster
  - [ ] unofficial tts.monster
- [ ] Review all settings UIs, make sure they're consistent with how they save

- [ ] Figure out how automatic upgrades works

- [x] Add a welcome "wizard" to setup connection to streamer.bot on first run
- [x] put password type on api key fields
- [x] bug: look at changing streamer bot url if it properly disconnects/destroys the object or if it ends up making multiple connections. Fix.
- [x] Have SSE endpoint send updates to user list when new users are added or changed
- [x] Move audio playback into the renderer process
- [x] Try packaging up and running electron app on its own, ensure I can distribute it
- [x] Move speech provider details into settings
- [x] Move streamer.bot details into settings
- [x] Implement settings page to manage general settings
- [x] Implement monster.tts integration
- [x] Implement azure integration
- [x] !stomp matches !s
- [x] Add a list of ignored users to not welcome or read tts
- [x] Create a status bar that includes pending renders, pending audio to play queue size, a quick way to switch modes
- [x] Intros: Write intros into twitch chat as text
  - [x] Implement triggering user-specified streamerbot actions when useful events happen
    - [x] first words (generic welcome text, custom intro)
- [x] In settings, etc, pin save bar to top when scrolling

Later

- [ ] Some voice volumes aren't very loud - add a volume slider and per-voice volumes
- [ ] Create a "speaker playground" that lets the user say anything in any voice
- [ ] disable intros for users, and disable globally
- [ ] Implement amazon polly integration
- [ ] Implement google integration
- [ ] Create setting to allow selecting default output device
- [ ] Create setup components for initial configuration
- [ ] set custom voice for intro
- [ ] respond to !tts commands in chat from mods, broadcaster
  - [ ] !tts on/off/pause/resume
  - [ ] !tts set nickname


## API Bridge idea

- Backend that runs remotely that acts as a relay so that moderators (or users granted access) can manage another user's SpeakManager

Remote User -> HTTP -> Bridge API -> Broadcaster User

Broadcaster User -> Websocket -> Bridge API

What would requests look like? How to secure/identify users?

- Could streamerbot be an intermediary?
  - would require custom actions - could create them with websocket access
