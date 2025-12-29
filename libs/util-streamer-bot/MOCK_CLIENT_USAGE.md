# Mock StreamerBot Client Usage

The mock StreamerBot client allows you to test your applications without requiring a real StreamerBot connection. You can programmatically generate events to test different scenarios.

## Enabling Mock Mode

### Option 1: URL Query Parameter
Add `?useMock=true` to your application URL:
```
http://localhost:4200/?useMock=true
```

### Option 2: Environment Configuration
Set `useMockStreamerBot: true` in your environment file:
```typescript
// apps/streamtools/src/environments/environment.ts
export const environment = {
  useMockStreamerBot: true,
};
```

## Using the Mock Client

### In Your Components/Services

```typescript
import { StreamerBotService } from '@streamtools/util-streamer-bot';

export class MyComponent {
  constructor(private streamerBotService: StreamerBotService) {}

  testFirstWords() {
    const mockClient = this.streamerBotService.getMockClient();
    if (mockClient) {
      mockClient.emitCustomEvent({
        type: 'FirstWords',
        username: 'testuser',
        profilePic: 'https://example.com/avatar.jpg'
      });
    }
  }

  testChatMessage() {
    const mockClient = this.streamerBotService.getMockClient();
    if (mockClient) {
      mockClient.emitChatMessage('viewer123', 'Hello chat!', 'mychannel', '#FF0000');
    }
  }

  testHeartRate() {
    const mockClient = this.streamerBotService.getMockClient();
    if (mockClient) {
      mockClient.emitHeartRatePulse(120);
    }
  }
}
```

### In Browser Console (Development)

For easy testing, you can expose the mock client to the window object. Add this to your app component:

```typescript
// In app.component.ts or main.ts
import { StreamerBotService } from '@streamtools/util-streamer-bot';

// In constructor or ngOnInit
const mockClient = streamerBotService.getMockClient();
if (mockClient && typeof window !== 'undefined') {
  (window as any).mockStreamerBot = mockClient;
}
```

Then in the browser console:
```javascript
// Emit a custom event
window.mockStreamerBot.emitCustomEvent({
  type: 'FirstWords',
  username: 'testuser',
  profilePic: 'https://example.com/avatar.jpg'
});

// Emit a chat message
window.mockStreamerBot.emitChatMessage('viewer123', 'Hello!');

// Emit heart rate
window.mockStreamerBot.emitHeartRatePulse(120);

// Emit any event type
window.mockStreamerBot.emitEvent('General.Custom', {
  startTimer: 60,
  timerLocation: 'left',
  timerTitle: 'Test Timer'
});
```

## Available Helper Methods

- `emitEvent(eventType, data)` - Emit any event type with custom data
- `emitCustomEvent(data)` - Emit a `General.Custom` event
- `emitChatMessage(username, message, channel?, color?)` - Emit a `Twitch.ChatMessage` event
- `emitHeartRatePulse(heartRate)` - Emit a `Pulsoid.HeartRatePulse` event
- `getSubscribedEvents()` - Get list of all subscribed event types
- `hasSubscribers(eventType)` - Check if an event type has subscribers

## Example Test Scenarios

### Testing First Words Component
```javascript
window.mockStreamerBot.emitCustomEvent({
  type: 'FirstWords',
  username: 'newviewer',
  profilePic: 'https://static-cdn.jtvnw.net/user-default-pictures/...'
});
```

### Testing Video Player
```javascript
window.mockStreamerBot.emitCustomEvent({
  eventType: 'video',
  data: {
    url: 'https://example.com/video.mp4',
    x: 100,
    y: 100,
    w: 640,
    h: 360
  }
});
```

### Testing Chat Messages
```javascript
// Simulate multiple chat messages
['user1', 'user2', 'user3'].forEach((user, i) => {
  setTimeout(() => {
    window.mockStreamerBot.emitChatMessage(user, `Message ${i + 1}`, 'mychannel');
  }, i * 1000);
});
```

