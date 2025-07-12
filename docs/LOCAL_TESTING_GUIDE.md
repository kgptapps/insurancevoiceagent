# 🧪 Local Testing Guide - Conversation Logging

## ✅ **Yes, You Can Test Locally!**

The conversation logging functionality can be fully tested locally with some simple setup. Here's how:

## 🔧 **Local Setup Options**

### **Option 1: Mock S3 with LocalStack (Recommended)**

LocalStack provides a local AWS cloud stack for testing.

#### Install LocalStack
```bash
# Install LocalStack
pip install localstack

# Or using Docker
docker run --rm -it -p 4566:4566 -p 4510-4559:4510-4559 localstack/localstack
```

#### Configure Local Environment
```bash
# backend/.env.local
NODE_ENV=development
OPENAI_API_KEY=your-real-openai-api-key
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566  # LocalStack endpoint
CONVERSATIONS_BUCKET=insurance-voice-agent-conversations-local
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

#### Create Local S3 Bucket
```bash
# Create bucket in LocalStack
aws --endpoint-url=http://localhost:4566 s3 mb s3://insurance-voice-agent-conversations-local
```

### **Option 2: File System Storage (Simplest)**

For quick testing, save conversations to local files instead of S3.

#### Create Local Storage Service
```javascript
// backend/src/services/localConversationStorage.js
import fs from 'fs/promises';
import path from 'path';

class LocalConversationStorage {
  constructor() {
    this.storageDir = './local-conversations';
    this.ensureStorageDir();
  }

  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
    }
  }

  async saveConversation(conversation) {
    const { conversationId, sessionId, startTime } = conversation;
    const datePrefix = new Date(startTime).toISOString().split('T')[0];
    
    // Create directory structure
    const sessionDir = path.join(this.storageDir, datePrefix, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const results = {};

    // Save conversation file
    const conversationFile = path.join(sessionDir, `${conversationId}_conversation.json`);
    await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));
    results.conversationFile = { path: conversationFile };

    // Save summary
    const summary = this.generateSummary(conversation);
    const summaryFile = path.join(sessionDir, `${conversationId}_summary.json`);
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    results.summaryFile = { path: summaryFile };

    // Save insurance data
    const insuranceData = this.extractInsuranceData(conversation);
    if (Object.keys(insuranceData).length > 0) {
      const insuranceFile = path.join(sessionDir, `${conversationId}_insurance_data.json`);
      await fs.writeFile(insuranceFile, JSON.stringify(insuranceData, null, 2));
      results.insuranceDataFile = { path: insuranceFile };
    }

    console.log(`💾 Conversation saved locally: ${sessionDir}`);
    return results;
  }

  generateSummary(conversation) {
    // Same logic as S3 version
    return {
      conversationId: conversation.conversationId,
      sessionId: conversation.sessionId,
      startTime: conversation.startTime,
      endTime: conversation.endTime,
      totalEvents: conversation.events.length,
      totalSnapshots: conversation.historySnapshots.length
    };
  }

  extractInsuranceData(conversation) {
    // Same logic as S3 version
    const insuranceData = {};
    for (const snapshot of conversation.historySnapshots) {
      if (snapshot.conversationState?.insuranceData) {
        Object.assign(insuranceData, snapshot.conversationState.insuranceData);
      }
    }
    return insuranceData;
  }
}

export default new LocalConversationStorage();
```

### **Option 3: Real AWS S3 (Production-like)**

Use your actual AWS account for testing.

```bash
# backend/.env.local
NODE_ENV=development
OPENAI_API_KEY=your-real-openai-api-key
AWS_REGION=us-east-1
CONVERSATIONS_BUCKET=insurance-voice-agent-conversations-dev
# Use your real AWS credentials
```

## 🧪 **Local Testing Scripts**

### **1. Simple Conversation Test**

```javascript
// test/conversation-logging-test.js
import realtimeSessionLogger from '../backend/src/services/realtimeSessionLogger.js';
import conversationLogger from '../backend/src/services/conversationLogger.js';

// Mock RealtimeSession for testing
class MockRealtimeSession {
  constructor() {
    this.history = [];
    this.eventListeners = {};
  }

  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  // Simulate conversation events
  simulateConversation() {
    // Simulate user message
    this.history.push({
      type: 'message',
      role: 'user',
      content: 'I need a car insurance quote',
      timestamp: new Date().toISOString()
    });
    this.emit('history_updated', this.history);
    this.emit('transcript', {
      transcript: 'I need a car insurance quote',
      speaker: 'user',
      confidence: 0.95
    });

    // Simulate agent response
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'assistant',
        content: 'I\'d be happy to help you with a car insurance quote. What year is your vehicle?',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', this.history);
      this.emit('response', {
        type: 'text',
        content: 'I\'d be happy to help you with a car insurance quote. What year is your vehicle?'
      });
    }, 1000);

    // Simulate user providing vehicle info
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'user',
        content: 'It\'s a 2020 Toyota Camry',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', this.history);
      this.emit('transcript', {
        transcript: 'It\'s a 2020 Toyota Camry',
        speaker: 'user',
        confidence: 0.92
      });
    }, 3000);

    // Simulate tool call
    setTimeout(() => {
      this.emit('tool_call', {
        name: 'get_insurance_quote',
        arguments: { vehicleYear: '2020', vehicleMake: 'Toyota', vehicleModel: 'Camry' }
      });

      this.history.push({
        type: 'function_call',
        name: 'get_insurance_quote',
        arguments: { vehicleYear: '2020', vehicleMake: 'Toyota', vehicleModel: 'Camry' },
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', this.history);
    }, 4000);
  }
}

// Test function
async function testConversationLogging() {
  console.log('🧪 Starting conversation logging test...');

  const sessionId = `test_session_${Date.now()}`;
  const mockSession = new MockRealtimeSession();

  // Setup logging
  const conversation = realtimeSessionLogger.setupSessionLogging(mockSession, sessionId, {
    userAgent: 'test-browser',
    ipAddress: '127.0.0.1',
    testMode: true
  });

  console.log(`📝 Started conversation: ${conversation.conversationId}`);

  // Simulate conversation
  mockSession.simulateConversation();

  // Wait for conversation to complete
  await new Promise(resolve => setTimeout(resolve, 6000));

  // End conversation and save
  const result = await realtimeSessionLogger.endSessionLogging(sessionId, {
    testCompleted: true,
    outcome: 'quote_requested'
  });

  console.log('✅ Conversation test completed!');
  console.log('📊 Results:', result);

  return result;
}

// Run test
testConversationLogging().catch(console.error);
```

### **2. Run the Test**

```bash
# Install dependencies
cd backend
npm install

# Run the test
node test/conversation-logging-test.js
```

### **3. Advanced Testing with Real OpenAI**

```javascript
// test/real-openai-test.js
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import realtimeSessionLogger from '../backend/src/services/realtimeSessionLogger.js';

async function testWithRealOpenAI() {
  console.log('🤖 Testing with real OpenAI RealtimeSession...');

  // Create real agent
  const agent = new RealtimeAgent({
    name: 'Test Insurance Agent',
    instructions: 'You are testing conversation logging. Ask the user about their vehicle for insurance.',
  });

  // Create real session
  const session = new RealtimeSession(agent, {
    model: 'gpt-4o-realtime-preview-2025-06-03',
    config: {
      inputAudioTranscription: {
        model: 'gpt-4o-mini-transcribe',
      },
    },
  });

  const sessionId = `real_test_${Date.now()}`;

  // Setup logging
  realtimeSessionLogger.setupSessionLogging(session, sessionId, {
    testMode: true,
    realOpenAI: true
  });

  try {
    // Connect to OpenAI
    await session.connect({ apiKey: process.env.OPENAI_API_KEY });
    console.log('🔗 Connected to OpenAI');

    // Send a test message
    session.sendMessage('I need a car insurance quote for my 2020 Toyota Camry');
    console.log('💬 Sent test message');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 10000));

    // End session
    const result = await realtimeSessionLogger.endSessionLogging(sessionId);
    console.log('✅ Real OpenAI test completed!');
    console.log('📊 Results:', result);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await session.disconnect();
  }
}

// Run real test (requires OPENAI_API_KEY)
if (process.env.OPENAI_API_KEY) {
  testWithRealOpenAI().catch(console.error);
} else {
  console.log('⚠️  Set OPENAI_API_KEY to run real OpenAI test');
}
```

## 📁 **Local Test Results**

After running tests, you'll see:

### **File System Storage (Option 2)**
```
local-conversations/
├── 2024-01-15/
│   └── test_session_1705312345/
│       ├── uuid_conversation.json
│       ├── uuid_summary.json
│       └── uuid_insurance_data.json
```

### **Sample Output**
```json
// uuid_conversation.json
{
  "conversationId": "test-uuid-123",
  "sessionId": "test_session_1705312345",
  "startTime": "2024-01-15T10:30:00.000Z",
  "endTime": "2024-01-15T10:30:06.000Z",
  "historySnapshots": [
    {
      "timestamp": "2024-01-15T10:30:01.000Z",
      "eventType": "history_updated",
      "history": [
        {
          "type": "message",
          "role": "user",
          "content": "I need a car insurance quote",
          "timestamp": "2024-01-15T10:30:00.500Z"
        }
      ],
      "conversationState": {
        "totalMessages": 1,
        "userMessages": 1,
        "assistantMessages": 0,
        "insuranceData": {}
      }
    }
  ],
  "events": [
    {
      "type": "transcript",
      "timestamp": "2024-01-15T10:30:00.600Z",
      "data": {
        "transcript": "I need a car insurance quote",
        "speaker": "user",
        "confidence": 0.95
      }
    }
  ]
}
```

## 🔍 **What You Can Test Locally**

### ✅ **Fully Testable**
- Conversation history tracking
- Event logging (transcripts, tool calls, etc.)
- Data extraction from conversations
- S3 storage (with LocalStack or real AWS)
- File system storage
- Analytics and summaries
- Search functionality

### ⚠️ **Requires OpenAI API Key**
- Real voice interactions
- Actual transcription quality
- Tool call execution
- Agent responses

### 🧪 **Testing Scenarios**

1. **Mock Conversations**: Test logging logic without OpenAI
2. **Real OpenAI Integration**: Test with actual API calls
3. **Storage Systems**: Test different storage backends
4. **Data Extraction**: Verify insurance data parsing
5. **Analytics**: Test conversation analysis
6. **Error Handling**: Test failure scenarios

## 🚀 **Quick Start Testing**

```bash
# 1. Clone and setup
cd backend
npm install

# 2. Create test environment
cp .env .env.local
# Edit .env.local with your settings

# 3. Run simple test
node test/conversation-logging-test.js

# 4. Check results
ls -la local-conversations/
```

**Yes, you can definitely test this locally!** The mock testing approach lets you verify all the logging logic, while the real OpenAI integration tests the complete flow. Start with the mock tests to validate the core functionality, then move to real OpenAI testing when you're ready.
