# SpeakManager

An app to provide TTS to twitch streams (or anything supported by streamerbot)

## Requirements

- Streamer.bot running and connected to you broadcast account
- Streamer.bot websocket server enabled

# TODO

- [ ] Move speech provider details into settings
- [ ] Move streamer.bot details into settings
- [ ] Implement settings page to manage general settings
- [ ] Create setting to allow selecting default output device
- [ ] Create setup components for initial configuration
- [ ] Design how mods can connect and use app (API bridge?)
- [ ] Implement monster.tts integration
- [ ] Implement azure integration

Later

- [ ] Implement amazon polly integration
- [ ] Implement google integration

## API Bridge idea

- Backend that runs remotely that acts as a relay so that moderators (or users granted access) can manage another user's SpeakManager

Remote User -> HTTP -> Bridge API -> Broadcaster User

Broadcaster User -> Websocket -> Bridge API

What would requests look like? How to secure/identify users?

- Could streamerbot be an intermediary?
  - would require custom actions - could create them with websocket access
