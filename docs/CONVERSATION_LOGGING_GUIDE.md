# Conversation Logging with OpenAI Voice Agents

## 🎯 Overview

Instead of building a custom audio recording system, we leverage **OpenAI's built-in features** for comprehensive conversation logging:

- **RealtimeSession History**: Automatic conversation tracking
- **OpenAI Tracing**: Built-in logging of all agent interactions
- **Event System**: Rich event handling for all conversation activities
- **S3 Storage**: Structured conversation data export

## 🔧 Implementation

### 1. Basic Integration

```javascript
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import realtimeSessionLogger from './services/realtimeSessionLogger.js';

// Create your voice agent
const agent = new RealtimeAgent({
  name: 'Insurance Agent',
  instructions: 'Help users with insurance quotes and information collection.',
});

// Create session with tracing enabled (default)
const session = new RealtimeSession(agent, {
  model: 'gpt-4o-realtime-preview-2025-06-03',
  config: {
    inputAudioTranscription: {
      model: 'gpt-4o-mini-transcribe', // Enable transcription
    },
  },
});

// Setup conversation logging
const sessionId = 'session_' + Date.now();
realtimeSessionLogger.setupSessionLogging(session, sessionId, {
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
  userType: 'insurance_customer'
});

// Connect and start conversation
await session.connect({ apiKey: process.env.OPENAI_API_KEY });
```

### 2. Automatic Event Logging

The system automatically captures:

```javascript
// ✅ Conversation history (OpenAI built-in)
session.on('history_updated', (history) => {
  // Automatically logged with conversation state analysis
});

// ✅ Audio events
session.on('audio', (audioEvent) => {
  // Logged with metadata (no raw audio storage needed)
});

// ✅ Transcriptions (OpenAI built-in)
session.on('transcript', (transcriptEvent) => {
  // Full transcript with speaker identification
});

// ✅ Tool calls and results
session.on('tool_call', (toolEvent) => {
  // Function calls with arguments
});

// ✅ Agent responses
session.on('response', (responseEvent) => {
  // Complete agent responses
});
```

### 3. Manual History Snapshots

```javascript
// Capture specific moments
realtimeSessionLogger.captureSessionHistory(sessionId, 'quote_completed');
realtimeSessionLogger.captureSessionHistory(sessionId, 'user_provided_vehicle_info');
```

### 4. End Session and Export

```javascript
// End conversation and save to S3
const conversationData = await realtimeSessionLogger.endSessionLogging(sessionId, {
  completionReason: 'quote_completed',
  userSatisfaction: 'high',
  dataCollected: true
});

console.log('Conversation saved:', conversationData.s3Results);
```

## 📊 What Gets Logged

### 1. Complete Conversation Data
```json
{
  "conversationId": "uuid",
  "sessionId": "session_123",
  "startTime": "2024-01-15T10:30:00Z",
  "endTime": "2024-01-15T10:45:00Z",
  "duration": {
    "seconds": 900,
    "formatted": "00:15:00"
  },
  "historySnapshots": [
    {
      "timestamp": "2024-01-15T10:30:15Z",
      "eventType": "history_updated",
      "history": [...], // OpenAI conversation history
      "conversationState": {
        "totalMessages": 12,
        "userMessages": 6,
        "assistantMessages": 6,
        "toolCalls": 2,
        "insuranceData": {
          "vehicleYear": "2020",
          "vehicleMake": "Toyota",
          "vehicleModel": "Camry",
          "zipCode": "90210"
        }
      }
    }
  ],
  "events": [
    {
      "type": "audio_received",
      "timestamp": "2024-01-15T10:30:05Z",
      "data": { "audioLength": 1024 }
    },
    {
      "type": "transcript",
      "timestamp": "2024-01-15T10:30:06Z",
      "data": {
        "transcript": "I need a car insurance quote",
        "speaker": "user",
        "confidence": 0.95
      }
    }
  ]
}
```

### 2. Conversation Summary
```json
{
  "conversationId": "uuid",
  "sessionId": "session_123",
  "statistics": {
    "totalMessages": 12,
    "userMessages": 6,
    "assistantMessages": 6,
    "toolCalls": 2,
    "duration": "00:15:00"
  },
  "topics": ["vehicle_info", "insurance_quote", "coverage_options"],
  "outcome": "quote_completed"
}
```

### 3. Extracted Insurance Data
```json
{
  "conversationId": "uuid",
  "sessionId": "session_123",
  "vehicleYear": "2020",
  "vehicleMake": "Toyota",
  "vehicleModel": "Camry",
  "zipCode": "90210",
  "phoneNumber": "XXX-XXX-XXXX", // Sanitized
  "email": "user@example.com", // Sanitized
  "extractedAt": "2024-01-15T10:45:00Z"
}
```

## 🗄️ S3 Storage Structure

```
conversations/
├── 2024-01-15/
│   ├── session_123/
│   │   ├── uuid_conversation.json      # Complete conversation
│   │   ├── uuid_summary.json          # Summary and analytics
│   │   └── uuid_insurance_data.json   # Extracted insurance data
│   └── session_124/
│       └── ...
└── 2024-01-16/
    └── ...
```

## 🔍 Analytics and Search

### Get Conversation Analytics
```javascript
const analytics = realtimeSessionLogger.getConversationAnalytics(sessionId);
console.log(analytics);
// {
//   totalMessages: 12,
//   messageTypes: { "message": 10, "function_call": 2 },
//   conversationFlow: {
//     userInitiated: 6,
//     agentInitiated: 6,
//     toolCalls: 2
//   },
//   duration: { seconds: 900, formatted: "00:15:00" }
// }
```

### Search Conversations
```javascript
const conversations = realtimeSessionLogger.searchConversations({
  startTimeAfter: '2024-01-15T00:00:00Z',
  minHistoryLength: 5
});
```

## 🔒 Privacy and Security

### Data Sanitization
- Phone numbers masked as `XXX-XXX-XXXX`
- Email addresses masked as `user@example.com`
- Configurable sensitive data patterns

### S3 Security
- Server-side encryption (AES256)
- Secure bucket policies
- Access logging enabled

### Compliance
- GDPR-ready data structure
- Easy data deletion by conversation ID
- Audit trail for all data access

## 🚀 Advantages Over Custom Audio Recording

### ✅ **OpenAI's Approach Benefits:**
1. **No Raw Audio Storage**: Transcripts are more useful and privacy-friendly
2. **Built-in Transcription**: High-quality speech-to-text included
3. **Structured Data**: Conversation history in usable format
4. **Event-Driven**: Rich event system for all interactions
5. **Automatic Tracing**: Built-in debugging and monitoring
6. **Lower Storage Costs**: Text vs. audio files
7. **Better Analytics**: Structured conversation analysis
8. **Privacy Compliant**: No sensitive audio data stored

### ❌ **Custom Audio Recording Drawbacks:**
1. Large storage requirements for audio files
2. Complex audio processing and transcription
3. Privacy concerns with raw audio storage
4. Difficult to analyze and search audio content
5. Higher infrastructure costs
6. Complex synchronization between audio and text

## 🔧 Configuration

### Environment Variables
```bash
# S3 Configuration
CONVERSATIONS_BUCKET=insurance-voice-agent-conversations-production
AWS_REGION=us-east-1

# OpenAI Configuration (tracing enabled by default)
OPENAI_API_KEY=your-api-key
# OPENAI_AGENTS_DISABLE_TRACING=1  # Uncomment to disable tracing
```

### AWS S3 Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:role/lambda-execution-role"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::insurance-voice-agent-conversations-production/*"
    }
  ]
}
```

## 📈 Monitoring and Alerts

### CloudWatch Metrics
- Conversation completion rate
- Average conversation duration
- Data extraction success rate
- S3 upload success rate

### Alerts
- Failed conversation saves
- High error rates
- Unusual conversation patterns

## 🔄 Integration with Existing Code

Replace your current session management with:

```javascript
// Before: Manual session tracking
// After: Integrated conversation logging

import realtimeSessionLogger from './services/realtimeSessionLogger.js';

// In your WebSocket handler
export async function handleWebSocketConnection(event, context) {
  const sessionId = extractSessionId(event);
  
  // Setup logging
  const conversation = realtimeSessionLogger.setupSessionLogging(
    session, 
    sessionId, 
    { userAgent: event.headers['User-Agent'] }
  );
  
  // Your existing session logic...
  
  // End logging when session ends
  await realtimeSessionLogger.endSessionLogging(sessionId);
}
```

This approach leverages OpenAI's robust built-in features while providing the conversation logging and analytics you need for your insurance voice agent!
