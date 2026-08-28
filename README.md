# SpeakManager

An app to provide TTS to twitch streams (or anything supported by streamerbot)

## Requirements

- Streamer.bot running and connected to you broadcast account
- Streamer.bot websocket server enabled

# Voices

## Piper voices
From this cobbled-together list: https://community.home-assistant.io/t/collections-of-pre-trained-piper-voices/915666/2

### Included
https://huggingface.co/rhasspy/piper-voices/tree/main

https://github.com/simoniz0r/piper-voice-models/tree/main
https://huggingface.co/campwill/HAL-9000-Piper-TTS/tree/main
https://huggingface.co/csukuangfj/vits-piper-en_US-glados-high/tree/main
https://github.com/dividebysandwich/piper-voice-models
https://github.com/DJMalachite/PiperVoiceModels/tree/main/Titanfall2/BT7274

### Pending

https://huggingface.co/BibEBobberson/Piper/tree/main # this has voices in tgz files
https://grace-central.net/Projects/piper/ # voices are in zip files

https://huggingface.co/poisson-fish/piper-vasco/tree/main/onnx # Hugging face seems to think this is suspicious

https://github.com/hopkira/k9_piper_voice
https://huggingface.co/davet2001/wheatley1/tree/main
https://huggingface.co/russdill/kronk/tree/main/en/en_US/kronk/medium
https://github.com/1liminal1/xiaozhi-esphome/tree/main/piper-voices
https://github.com/robit-man/combine_overwatch_onnx
https://huggingface.co/Aquaaa123/piper-tts-pda-subnautica/tree/main
https://github.com/sparky-vision/fedcomp?tab=readme-ov-file
https://github.com/cosycove/BeefStew/tree/5bb2191bf64af7da19b1da7994dc355200fb29f1/src/data/tts_voices
https://huggingface.co/jgkawell/jarvis/tree/main
https://huggingface.co/AkumaVenom/RocketRacoon-Piper-US-Medium/tree/main
https://github.com/stoney66/piper-voices
https://github.com/programmingPug/AIVoices_HA
https://github.com/Davis8483/portal2-announcer-piper-tts
https://github.com/willovex/geralt-piper-voice
https://github.com/TacitusCornelius/shodan-piper-tts


# TODO
- [ ] Making a setting empty doesn't actually save it in the database. The old setting is retained.

- [ ] Design how mods can connect and use app (API bridge?)
- [x] Voicelist: Create filters that can help pair down the voice selection
  - [x] azure voices: add filters for locale, gender
  - [x] groups: add ability to "roll up" groups, make it easier to find voices in other groups by scrolling
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
