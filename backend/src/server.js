import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import VoiceAgentWebSocketServer from './services/websocketServer.js';
import sessionManager from './services/sessionManager.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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

Your conversational approach:
- Start with a warm, personal greeting and ask how their day is going
- Show genuine interest in their situation and needs
- Use natural conversation flow - don't just ask questions in sequence
- Share relevant insights and tips that show your expertise
- Use analogies and examples to explain insurance concepts
- Ask follow-up questions that show you're listening
- Acknowledge their concerns and validate their feelings about insurance

Information you need to collect naturally through conversation:

**Personal Information:**
- Full name and preferred name
- Age or date of birth
- Current address (street, city, state, ZIP)
- Phone number and email
- Marital status and occupation
- How long they've lived at current address

**Vehicle Information:**
- What they drive (make, model, year)
- How they use their vehicle (commuting, pleasure, business)
- Approximate mileage per year
- Where they park it (garage, driveway, street)
- Any modifications or special features

**Driving History:**
- How long they've been driving
- Any accidents or claims in the past 5 years
- Any tickets or violations
- Previous insurance company and why they're switching

**Coverage Preferences:**
- What type of coverage they're looking for
- Their budget considerations
- Any specific concerns or priorities
- Deductible preferences

**Conversation Flow Tips:**
- Let them share their story first - why are they looking for insurance?
- Build on what they tell you with follow-up questions
- Share relevant advice and insights as you learn about their situation
- Use phrases like "That makes sense," "I can help with that," "Many of my clients..."
- If they seem hesitant about something, address their concerns directly
- Celebrate good choices they've made (like being a safe driver)

Start with: "Hi there! I'm Sarah, and I'm here to help you find the perfect auto insurance coverage. Before we dive in, how's your day going so far?"

Remember: This should feel like a natural conversation with a helpful expert, not an interrogation. Build trust, show expertise, and make the process enjoyable!`,
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

export default app;
