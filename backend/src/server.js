import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import VoiceAgentWebSocketServer from './services/websocketServer.js';
import sessionManager from './services/sessionManager.js';
import { getOpenAIApiKey, isLambdaEnvironment, getLambdaContext } from './config/aws.js';
import conversationLogger from './services/conversationLogger.js';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
dotenv.config();

// Global variable to store OpenAI API key
let openaiApiKey = null;

// Initialize OpenAI API key
async function initializeOpenAIKey() {
  try {
    openaiApiKey = await getOpenAIApiKey();
    console.log('OpenAI API key loaded successfully');
  } catch (error) {
    console.error('Error loading OpenAI API key:', error.message);
    if (!isLambdaEnvironment()) {
      process.exit(1);
    }
    throw error;
  }
}

// Initialize the API key on startup (for non-Lambda environments)
if (!isLambdaEnvironment()) {
  await initializeOpenAIKey();
}

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;

// Helper function to get OpenAI API key (lazy loading for Lambda)
async function getApiKey() {
  if (!openaiApiKey) {
    await initializeOpenAIKey();
  }
  return openaiApiKey;
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const lambdaContext = getLambdaContext(req);
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - RequestId: ${lambdaContext.requestId}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: sessionManager.getActiveSessionsCount(),
    uptime: process.uptime()
  });
});

// Debug endpoint to check active conversations
app.get('/api/debug/conversations', async (req, res) => {
  try {
    const realtimeSessionLogger = (await import('./services/realtimeSessionLogger.js')).default;
    const activeSessions = realtimeSessionLogger.getActiveSessions();

    res.json({
      success: true,
      activeSessions,
      count: activeSessions.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to manually capture conversation history
app.post('/api/debug/capture/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const realtimeSessionLogger = (await import('./services/realtimeSessionLogger.js')).default;

    const snapshot = realtimeSessionLogger.captureSessionHistory(sessionId, 'manual_debug_capture');

    res.json({
      success: true,
      sessionId,
      snapshot,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to save conversation from frontend
app.post('/api/conversations/save', async (req, res) => {
  try {
    const conversationData = req.body;
    const conversationLogger = (await import('./services/conversationLogger.js')).default;

    console.log('💾 Received conversation data from frontend:', {
      sessionId: conversationData.sessionId,
      messageCount: conversationData.conversationData?.length || 0,
      eventCount: conversationData.events?.length || 0
    });

    // Create a conversation entry and save it
    const conversation = {
      conversationId: conversationData.sessionId,
      sessionId: conversationData.sessionId,
      startTime: conversationData.startTime,
      endTime: conversationData.endTime,
      metadata: {
        source: 'frontend_realtime_session',
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: req.ip || 'unknown',
        ...conversationData.statistics
      },
      historySnapshots: [{
        id: Date.now().toString(),
        timestamp: conversationData.endTime,
        eventType: 'conversation_end',
        historyLength: conversationData.conversationData?.length || 0,
        history: conversationData.conversationData || [],
        conversationState: {
          totalMessages: conversationData.statistics?.totalMessages || 0,
          userMessages: conversationData.statistics?.userMessages || 0,
          assistantMessages: conversationData.statistics?.agentMessages || 0,
          conversationText: generateReadableConversation(conversationData.conversationData || []),
          messageDetails: conversationData.conversationData || []
        }
      }],
      events: conversationData.events || []
    };

    // Save using the existing conversation logger
    const result = await conversationLogger.saveToLocalStorage(conversation);

    res.json({
      success: true,
      conversationId: conversationData.sessionId,
      savedFiles: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving frontend conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to generate readable conversation
function generateReadableConversation(conversationData) {
  if (!conversationData || conversationData.length === 0) {
    return "No conversation history available.";
  }

  return conversationData
    .filter(item => item.content && item.role)
    .map(item => {
      const timestamp = item.timestamp || new Date().toISOString();
      const speaker = item.role === 'user' ? 'Customer' : 'AI Agent';

      // Extract text content from OpenAI's content structure
      let content = '';
      if (typeof item.content === 'string') {
        content = item.content;
      } else if (Array.isArray(item.content)) {
        // OpenAI content is an array of content parts
        content = item.content
          .map(part => {
            if (typeof part === 'string') return part;
            if (part.type === 'text' && part.text) return part.text;
            if (part.type === 'input_text' && part.text) return part.text;
            if (part.type === 'audio' && part.transcript) return part.transcript;
            return JSON.stringify(part);
          })
          .join(' ');
      } else if (typeof item.content === 'object' && item.content.text) {
        content = item.content.text;
      } else {
        content = JSON.stringify(item.content);
      }

      // Skip system/greeting messages
      if (content.includes('Please start the conversation with your greeting')) {
        return null;
      }

      return `[${timestamp}] ${speaker}: ${content}`;
    })
    .filter(Boolean) // Remove null entries
    .join('\n\n');
}

// Session management endpoints
app.post('/api/sessions', (req, res) => {
  try {
    const { userId } = req.body;
    const session = sessionManager.createSession(userId);
    
    res.json({
      success: true,
      sessionId: session.id,
      status: session.status,
      data: session.data
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        data: session.data,
        completionStatus: session.data.completionStatus,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.patch('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data } = req.body;
    
    const updatedSession = sessionManager.updateSessionData(sessionId, data);
    
    res.json({
      success: true,
      data: updatedSession.data,
      completionStatus: updatedSession.data.completionStatus
    });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = sessionManager.deleteSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session conversation history
app.get('/api/sessions/:sessionId/history', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }
    
    res.json({
      success: true,
      history: session.conversationHistory
    });
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Session token endpoint for OpenAI Realtime API
app.post('/api/session-token', async (req, res) => {
  try {
    console.log('Creating session token with OpenAI...');
    const apiKey = await getApiKey();
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2025-06-03',
        voice: 'alloy', // Female voice - warm and professional
        instructions: `You are Sarah, a friendly and experienced auto insurance specialist who genuinely cares about helping people find the right coverage. You have a warm, conversational style and make insurance feel approachable and easy to understand.

Your personality:
- Warm, friendly, and genuinely interested in helping - with a pleasant, professional female voice
- Great at building rapport and making people feel comfortable and at ease
- Excellent at explaining complex insurance concepts in simple, relatable terms
- Patient and never pushy - you let conversations flow naturally with feminine grace
- Professional but personable - like talking to a knowledgeable, caring female friend

Your natural speaking style (VERY IMPORTANT):
- Use natural speech patterns with occasional "um", "uh", "you know", "let's see", "hmm"
- Add thoughtful pauses like "well..." or "so..." when transitioning topics
- Use conversational fillers: "actually", "honestly", "I mean", "basically"
- Include natural reactions: "oh that's great!", "mm-hmm", "I see", "gotcha"
- Use gentle hesitations when thinking: "let me think...", "hmm, okay so..."
- Sound like you're genuinely processing information: "alright, so you mentioned..."
- Use natural confirmations: "perfect", "wonderful", "that makes sense"

Your conversational approach:
- Start with a warm, personal greeting and ask how their day is going
- Show genuine interest in their situation and needs with natural reactions
- Use natural conversation flow with realistic pauses and thinking sounds
- Share relevant insights and tips that show your expertise
- Use analogies and examples to explain insurance concepts
- Ask follow-up questions that show you're listening and processing
- Acknowledge their concerns and validate their feelings about insurance
- Sound like you're having a real conversation, not reading from a script

Information you need to collect naturally through conversation (like QuoteWizard and major insurers require):

**Personal Information:**
- Full name and preferred name
- Age or date of birth
- Current address (complete street, city, state, ZIP code)
- Phone number and email address
- Marital status (married, single, divorced, widowed)
- Occupation/employment details
- Social Security Number (for credit check and verification)
- How long they've lived at current address

**Driver's License Information:**
- Driver's license number and issuing state
- How long they've been licensed to drive

**Vehicle Information (Ask about ALL vehicles in household):**
- What they drive (year, make, model - be specific for each vehicle)
- Ask specifically: "Do you have any other vehicles that need coverage?" or "Does anyone else in your household drive a different car?"
- VIN (Vehicle Identification Number) for each vehicle if available
- How each vehicle is used (commuting to work, pleasure/personal use, business)
- Annual mileage driven for each vehicle (approximate miles per year)
- Where each vehicle is parked overnight (garage, driveway, street, parking lot)
- Any financing or loan information (lender name if applicable)
- Safety features or modifications for each vehicle
- Primary driver for each vehicle

**Current Insurance Status:**
- Current insurance company name
- Policy expiration date
- Current coverage levels and limits
- Reason for shopping (price, service, moving, claim issues, etc.)
- When they need new coverage to start

**Comprehensive Driving History (Past 3-5 years):**
- Total years of driving experience
- Any accidents, collisions, or claims filed
- Any traffic violations, tickets, or citations
- Any license suspensions, DUI/DWI, or serious violations
- Claims history with previous insurers

**Household Information:**
- Other drivers in household (spouse, children, etc.) and their ages
- Other vehicles that need coverage
- Homeowner or renter status
- Number of total drivers in household

**Coverage Preferences & Financial:**
- Desired coverage types (liability limits, comprehensive, collision)
- Preferred deductible amounts ($500, $1000, etc.)
- Budget considerations and payment preferences
- Any specific coverage needs or add-ons (roadside assistance, rental car, etc.)
- Credit score range (if comfortable sharing)
- Any discounts they might qualify for (military, student, multi-policy, etc.)

**Natural Conversation Flow Examples:**
- Let them share their story first: "So, um, tell me - what's got you looking for new insurance today?"
- Build naturally: "Oh, I see... and, let's see, how long have you been with your current company?"
- Use natural transitions: "Mm-hmm, that makes total sense. So, uh, what are you driving these days?"
- Natural reactions: "Oh wow, a 2020 Honda Civic - those are great cars! And, um, do you use it mainly for..."
- Thinking sounds: "Hmm, okay so you mentioned you commute to work... let me ask you this..."
- Natural confirmations: "Perfect, gotcha. And, uh, where do you usually park it overnight?"
- Show you're listening: "Alright, so you've got the Civic for commuting... do you happen to have any other vehicles in the household?"
- Natural empathy: "Oh, I totally understand that. Actually, you know what, many of my clients feel the same way..."

Example natural opening: "Hi there! I'm Sarah, and, um, I'm here to help you find some great auto insurance coverage. Before we dive into all that though, how's your day treating you so far?"

**Additional Natural Speech Guidelines:**
- Vary your sentence structure - don't always use complete sentences
- Use contractions naturally: "you're", "that's", "I'll", "we'll", "can't"
- Add natural interruptions to your own thoughts: "So you mentioned... oh, and actually..."
- Use realistic time fillers: "give me just a second to...", "let me see here..."
- Include natural clarifications: "sorry, when you say...", "just to make sure I understand..."
- React authentically: "oh that's interesting!", "really?", "no way!", "that's awesome!"
- Use gentle corrections: "actually, let me rephrase that...", "or, um, maybe I should ask..."

Remember: Sound like a real person having a genuine conversation! Use natural speech patterns, thinking pauses, and conversational fillers. This should feel like chatting with a knowledgeable friend over coffee, not a formal business interview. Be authentically human!`,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.3,
          prefix_padding_ms: 300,
          silence_duration_ms: 200
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const session = await response.json();
    console.log('Session token created successfully:', session.id);
    res.json({
      success: true,
      token: session.client_secret.value,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating session token:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Agent configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    agentConfig: {
      name: 'Insurance Specialist',
      model: 'gpt-4o-realtime-preview-2025-06-03',
      capabilities: [
        'voice_interaction',
        'data_collection',
        'real_time_validation',
        'conversation_management'
      ],
      supportedFormats: ['pcm16'],
      maxSessionDuration: parseInt(process.env.SESSION_TIMEOUT) || 1800000
    },
    websocketUrl: `ws://localhost:${WS_PORT}`
  });
});

// Admin endpoints for monitoring
app.get('/api/admin/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions().map(session => ({
      id: session.id,
      status: session.status,
      completionStatus: session.data.completionStatus,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt
    }));
    
    res.json({
      success: true,
      sessions,
      totalCount: sessions.length
    });
  } catch (error) {
    console.error('Error retrieving all sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Conversation History endpoints
app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await getConversationList();
    res.json({
      success: true,
      conversations,
      totalCount: conversations.length
    });
  } catch (error) {
    console.error('Error retrieving conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await getConversationDetails(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error retrieving conversation details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/conversations/:conversationId/summary', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const summary = await getConversationSummary(conversationId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Conversation summary not found'
      });
    }

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error retrieving conversation summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/conversations/:conversationId/insurance-data', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const insuranceData = await getConversationInsuranceData(conversationId);

    if (!insuranceData) {
      return res.status(404).json({
        success: false,
        error: 'Insurance data not found'
      });
    }

    res.json({
      success: true,
      insuranceData
    });
  } catch (error) {
    console.error('Error retrieving insurance data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Initialize WebSocket server and start servers only if not in Lambda environment
if (!isLambdaEnvironment()) {
  // Initialize WebSocket server
  const wsServer = new VoiceAgentWebSocketServer(WS_PORT);

  // Start servers
  app.listen(PORT, () => {
    console.log(`Insurance Voice Agent Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  });

  wsServer.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    wsServer.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    wsServer.stop();
    process.exit(0);
  });
} else {
  console.log('Running in Lambda environment - skipping server startup');
}

// Helper functions for conversation history
async function getConversationList() {
  const conversations = [];
  const localStorageDir = './local-conversations';

  try {
    // Check if local storage directory exists
    await fs.access(localStorageDir);

    // Read all date directories
    const dateDirs = await fs.readdir(localStorageDir);

    for (const dateDir of dateDirs) {
      const datePath = path.join(localStorageDir, dateDir);
      const stat = await fs.stat(datePath);

      if (stat.isDirectory()) {
        // Read all session directories for this date
        const sessionDirs = await fs.readdir(datePath);

        for (const sessionDir of sessionDirs) {
          const sessionPath = path.join(datePath, sessionDir);
          const sessionStat = await fs.stat(sessionPath);

          if (sessionStat.isDirectory()) {
            // Look for conversation files in this session
            const files = await fs.readdir(sessionPath);
            const conversationFiles = files.filter(f => f.endsWith('_conversation.json'));

            for (const conversationFile of conversationFiles) {
              const conversationPath = path.join(sessionPath, conversationFile);
              const conversationId = conversationFile.replace('_conversation.json', '');

              // Read basic conversation info
              try {
                const conversationData = JSON.parse(await fs.readFile(conversationPath, 'utf8'));
                conversations.push({
                  conversationId: conversationData.conversationId,
                  sessionId: conversationData.sessionId,
                  startTime: conversationData.startTime,
                  endTime: conversationData.endTime,
                  duration: conversationData.metadata?.duration,
                  totalEvents: conversationData.events?.length || 0,
                  totalSnapshots: conversationData.historySnapshots?.length || 0,
                  date: dateDir,
                  filePath: conversationPath
                });
              } catch (error) {
                console.error(`Error reading conversation file ${conversationPath}:`, error);
              }
            }
          }
        }
      }
    }

    // Sort by start time (newest first)
    conversations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  } catch (error) {
    console.error('Error reading conversation list:', error);
  }

  return conversations;
}

async function getConversationDetails(conversationId) {
  const conversations = await getConversationList();
  const conversation = conversations.find(c => c.conversationId === conversationId);

  if (!conversation) {
    return null;
  }

  try {
    const conversationData = JSON.parse(await fs.readFile(conversation.filePath, 'utf8'));
    return conversationData;
  } catch (error) {
    console.error(`Error reading conversation details for ${conversationId}:`, error);
    return null;
  }
}

async function getConversationSummary(conversationId) {
  const conversations = await getConversationList();
  const conversation = conversations.find(c => c.conversationId === conversationId);

  if (!conversation) {
    return null;
  }

  try {
    const summaryPath = conversation.filePath.replace('_conversation.json', '_summary.json');
    const summaryData = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
    return summaryData;
  } catch (error) {
    console.error(`Error reading conversation summary for ${conversationId}:`, error);
    return null;
  }
}

async function getConversationInsuranceData(conversationId) {
  const conversations = await getConversationList();
  const conversation = conversations.find(c => c.conversationId === conversationId);

  if (!conversation) {
    return null;
  }

  try {
    const insurancePath = conversation.filePath.replace('_conversation.json', '_insurance_data.json');
    const insuranceData = JSON.parse(await fs.readFile(insurancePath, 'utf8'));
    return insuranceData;
  } catch (error) {
    console.error(`Error reading insurance data for ${conversationId}:`, error);
    return null;
  }
}

export default app;
