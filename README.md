# SpeakManager

An app to provide TTS to twitch streams.

# TODO

- [ ] Implement settings page to manage general settings
- [ ] Move settings for streamer.bot connection, TTS providers into settings
- [ ] Create setup components for initial configuration
- [ ] Create setting to allow selecting default output device
- [ ] Design how mods can connect and use app (API bridge?)

## API Bridge idea

- Backend that runs remotely that acts as a relay

Remote User -> HTTP -> Bridge API -> Broadcaster User

Broadcaster User -> Websocket -> Bridge API

