# Local Conversation Logging for Voice Agents

This guide explains how to capture and log voice agent conversations to your local file system using OpenAI's built-in conversation tracking features.

## 🎯 Overview

Instead of building custom audio recording systems, we leverage **OpenAI's RealtimeSession** built-in features:

- **Automatic History Tracking**: OpenAI maintains conversation history automatically
- **Rich Event System**: Capture transcripts, audio events, tool calls, and more
- **Local File Storage**: Save conversations to local files instead of cloud storage
- **Zero Configuration**: Works out of the box with existing voice agents

## 🚀 Quick Start

### 1. Basic Integration

```javascript
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import localConversationLogger from './services/localConversationLogger.js';

// Create your voice agent
const agent = new RealtimeAgent({
  name: 'Insurance Agent',
  instructions: 'Help users with insurance quotes.',
});

// Create session with transcription enabled
const session = new RealtimeSession(agent, {
  model: 'gpt-4o-realtime-preview-2025-06-03',
  config: {
    inputAudioTranscription: {
      model: 'whisper-1' // Enable transcription for logging
    },
  },
});

// Start logging
const sessionId = 'session_' + Date.now();
localConversationLogger.startLogging(session, sessionId, {
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
  userType: 'insurance_customer'
});
```

### 2. End Session and Save

```javascript
// When conversation ends
const result = await localConversationLogger.stopLogging(sessionId, {
  completionReason: 'quote_completed',
  userSatisfaction: 'high',
  dataCollected: true
});

console.log('Conversation saved:', result.savedFiles);
```

## 📁 File Structure

Conversations are saved to `local-conversations/` directory:

```
local-conversations/
├── 2025-01-13/                    # Date folder
│   └── session_1736789123456/     # Session folder
│       ├── conv_abc123_14-30-15_conversation.json    # Full conversation history
│       ├── conv_abc123_14-30-15_transcript.txt       # Readable transcript
│       ├── conv_abc123_14-30-15_events.json          # All events log
│       └── conv_abc123_14-30-15_metadata.json        # Session metadata
└── 2025-01-14/
    └── session_1736875523789/
        └── ...
```

## 📊 What Gets Captured

### Automatic Capture
- ✅ **Complete conversation history** (from OpenAI RealtimeSession)
- ✅ **Transcripts** (user and agent speech-to-text)
- ✅ **Audio events** (metadata about audio chunks)
- ✅ **Tool calls** (function calls and results)
- ✅ **Agent responses** (text and audio responses)
- ✅ **Session events** (connect, disconnect, interruptions)
- ✅ **Error events** (any errors during conversation)

### Manual Capture
- ✅ **Conversation snapshots** (capture specific moments)
- ✅ **Custom events** (mark important conversation points)

## 🔧 Configuration

### Environment Variables

```bash
# Optional: Custom conversations directory
CONVERSATIONS_DIR=/path/to/conversations

# Required: OpenAI API key
OPENAI_API_KEY=your_openai_api_key
```

### Default Settings

- **Directory**: `./local-conversations/` (relative to your app)
- **File Format**: JSON for data, TXT for readable transcripts
- **Naming**: `conversationId_timestamp_type.extension`

## 📝 Usage Examples

### WebSocket Integration

```javascript
import { setupWebSocketWithLogging } from './examples/localConversationExample.js';

// In your WebSocket server
wss.on('connection', (ws, req) => {
  setupWebSocketWithLogging(ws, req);
});
```

### Express.js API

```javascript
import { setupAPIEndpoints } from './examples/localConversationExample.js';

// Add conversation logging endpoints
setupAPIEndpoints(app);

// Available endpoints:
// POST /api/conversations/start
// POST /api/conversations/:sessionId/end
// GET  /api/conversations/:sessionId/status
// GET  /api/conversations/active
// POST /api/conversations/:sessionId/snapshot
```

### Manual Snapshot Capture

```javascript
// Capture conversation at specific moments
localConversationLogger.captureSnapshot(sessionId, 'quote_completed');
localConversationLogger.captureSnapshot(sessionId, 'vehicle_info_collected');
localConversationLogger.captureSnapshot(sessionId, 'user_provided_contact');
```

## 📋 API Reference

### `localConversationLogger.startLogging(session, sessionId, metadata)`

Start logging a RealtimeSession conversation.

**Parameters:**
- `session`: OpenAI RealtimeSession instance
- `sessionId`: Unique session identifier
- `metadata`: Optional metadata object

**Returns:** Session data object

### `localConversationLogger.stopLogging(sessionId, finalMetadata)`

Stop logging and save conversation to files.

**Parameters:**
- `sessionId`: Session identifier
- `finalMetadata`: Optional final metadata

**Returns:** Promise with saved files info

### `localConversationLogger.captureSnapshot(sessionId, eventType)`

Manually capture conversation history snapshot.

**Parameters:**
- `sessionId`: Session identifier
- `eventType`: Type of event (e.g., 'quote_completed')

**Returns:** Snapshot object

### `localConversationLogger.getSessionStatus(sessionId)`

Get current session status and statistics.

**Returns:** Session status object or null

### `localConversationLogger.getActiveSessions()`

Get all currently active logging sessions.

**Returns:** Array of active session statuses

## 📄 File Formats

### Conversation File (`*_conversation.json`)
```json
{
  "conversationId": "uuid",
  "sessionId": "session_123",
  "startTime": "2025-01-13T14:30:15.123Z",
  "endTime": "2025-01-13T14:35:22.456Z",
  "metadata": { ... },
  "finalHistory": [ ... ],
  "conversationText": "readable conversation"
}
```

### Transcript File (`*_transcript.txt`)
```
[2025-01-13T14:30:15.123Z] User (95%): Hi, I need car insurance
[2025-01-13T14:30:16.456Z] Agent: Hello! I'd be happy to help you with car insurance...
```

### Events File (`*_events.json`)
```json
[
  {
    "id": "event_uuid",
    "timestamp": "2025-01-13T14:30:15.123Z",
    "type": "session_connected",
    "data": { ... }
  }
]
```

## 🔍 Monitoring

### Check Active Sessions
```javascript
const activeSessions = localConversationLogger.getActiveSessions();
console.log(`Active conversations: ${activeSessions.length}`);
```

### Session Statistics
```javascript
const status = localConversationLogger.getSessionStatus(sessionId);
console.log(`Events: ${status.eventsCount}, History: ${status.currentHistoryLength}`);
```

## 🛠 Troubleshooting

### Common Issues

1. **No transcripts captured**
   - Ensure `inputAudioTranscription` is enabled in session config
   - Check that `whisper-1` model is available

2. **Files not saving**
   - Check write permissions for conversations directory
   - Verify disk space availability

3. **Missing conversation history**
   - Ensure session is properly connected before logging
   - Check for session disconnection events

### Debug Logging

Enable debug logging to see what's being captured:

```javascript
// Add to your environment
DEBUG=conversation-logger

// Or add console logs in the logger
console.log('Captured event:', eventType, eventData);
```

## 🔒 Privacy & Security

- **Local Storage**: All data stays on your server
- **No Cloud Dependencies**: No external services required
- **Data Sanitization**: Sensitive data can be filtered out
- **File Permissions**: Ensure proper file system permissions

## 🚀 Next Steps

1. **Integrate with your existing voice agent**
2. **Customize metadata and event types**
3. **Add conversation analytics**
4. **Build admin dashboard for conversation review**
5. **Implement conversation search and filtering**

For more examples, see `backend/src/examples/localConversationExample.js`.
