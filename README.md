# SpeakManager

An app to provide TTS to twitch streams (or anything supported by streamerbot)

## Requirements

- Streamer.bot running and connected to you broadcast account
- Streamer.bot websocket server enabled

# TODO

- [x] Create a status bar that includes pending renders, pending audio to play queue size, a quick way to switch modes
- [ ] Create a "speaker playground" that lets the user say anything in any voice
- [ ] Some voice volumes aren't very loud - add a volume slider and per-voice volumes
- [ ] Instead of depending on streamer.bot for chat, use twurple to connect to chat directly.
  - [ ] Ensure that twitch tokens / refresh tokens are as long lived as possible
- [ ] Intros: Write intros into twitch chat as text
- [ ] Design how mods can connect and use app (API bridge?)
- [ ] disable intros for users, and disable globally
- [ ] Voicelist: Create filters that can help pair down the voice selection
  - [ ] azure voices: add filters for locale, gender
  - [ ] groups: add ability to "roll up" groups, make it easier to find voices in other groups by scrolling
- [ ] Review all settings UIs, make sure they're consistent with how they save
- [ ] In settings, etc, pin save bar to top when scrolling

- [ ] Try packaging up and running electron app on its own, ensure I can distribute it
- [ ] Figure out how automatic upgrades works

- [x] Move speech provider details into settings
- [x] Move streamer.bot details into settings
- [x] Implement settings page to manage general settings
- [x] Implement monster.tts integration
- [x] Implement azure integration
- [x] !stomp matches !s
- [x] Add a list of ignored users to not welcome or read tts

Later

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
