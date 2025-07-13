import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import localConversationLogger from '../services/localConversationLogger.js';

/**
 * Example: How to use Local Conversation Logger with OpenAI Voice Agents
 * 
 * This example shows how to integrate the local conversation logger
 * with your existing voice agent to capture conversations and save
 * them to local files instead of S3.
 */

// Example usage in your WebSocket server or API endpoint
export async function setupVoiceAgentWithLocalLogging(req, res) {
  try {
    // 1. Create your voice agent (same as before)
    const insuranceAgent = new RealtimeAgent({
      name: 'QuoteWizard Insurance Agent',
      instructions: `You are a friendly and professional insurance agent helping customers get auto insurance quotes.

Your primary goals:
- Collect comprehensive auto insurance information
- Provide excellent customer service
- Guide customers through the quote process naturally

Key Information to Collect:
1. **Insurance Purpose**: Ask about their insurance needs (new policy, renewal, adding vehicle, etc.)
2. **Personal Information**: Name, email, phone, address, date of birth, gender, marital status
3. **Vehicle Information**: Year, make, model, VIN (if available)
4. **Current Insurance**: Current insurer, coverage details, claims history
5. **Driving History**: License information, accidents, violations

Remember:
- START TALKING FIRST - don't wait for the customer
- Be conversational and natural
- Ask follow-up questions to get complete information
- Confirm important details
- ALWAYS ask about their insurance purpose first!`,
    });

    // 2. Create RealtimeSession with transcription enabled
    const realtimeSession = new RealtimeSession(insuranceAgent, {
      model: 'gpt-4o-realtime-preview-2025-06-03',
      config: {
        inputAudioFormat: 'pcm16',
        outputAudioFormat: 'pcm16',
        inputAudioTranscription: {
          model: 'whisper-1' // Enable transcription for conversation logging
        },
        turnDetection: {
          type: 'server_vad',
          threshold: 0.3,
          prefixPaddingMs: 300,
          silenceDurationMs: 200
        },
        voice: 'alloy',
        modalities: ['text', 'audio']
      }
    });

    // 3. Start local conversation logging
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const conversationData = localConversationLogger.startLogging(realtimeSession, sessionId, {
      userAgent: req.headers['user-agent'] || 'unknown',
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userType: 'insurance_customer',
      source: 'web_app',
      agentType: 'insurance_quote'
    });

    console.log(`Started conversation logging:`, {
      sessionId,
      conversationId: conversationData.conversationId
    });

    // 4. Set up additional event handlers for your application
    realtimeSession.on('connected', () => {
      console.log(`Voice agent connected for session ${sessionId}`);
    });

    realtimeSession.on('disconnected', () => {
      console.log(`Voice agent disconnected for session ${sessionId}`);
      // Automatically save conversation when session ends
      handleSessionEnd(sessionId);
    });

    // 5. Optional: Capture specific moments during conversation
    realtimeSession.on('tool_call', (toolEvent) => {
      if (toolEvent.name === 'extract_insurance_data') {
        // Capture snapshot when insurance data is extracted
        localConversationLogger.captureSnapshot(sessionId, 'insurance_data_extracted');
      }
    });

    // 6. Return session info for your application
    return {
      sessionId,
      conversationId: conversationData.conversationId,
      realtimeSession,
      status: 'ready'
    };

  } catch (error) {
    console.error('Error setting up voice agent with local logging:', error);
    throw error;
  }
}

/**
 * Handle session end and save conversation
 */
async function handleSessionEnd(sessionId, metadata = {}) {
  try {
    console.log(`Ending conversation logging for session ${sessionId}`);
    
    const result = await localConversationLogger.stopLogging(sessionId, {
      completionReason: metadata.reason || 'session_ended',
      userSatisfaction: metadata.satisfaction || 'unknown',
      dataCollected: metadata.dataCollected || false,
      endedBy: metadata.endedBy || 'system'
    });

    console.log(`Conversation saved successfully:`, {
      sessionId: result.sessionId,
      conversationId: result.conversationId,
      savedFiles: Object.keys(result.savedFiles),
      duration: result.metadata.duration
    });

    return result;

  } catch (error) {
    console.error(`Error ending conversation logging for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Get conversation status (useful for monitoring)
 */
export function getConversationStatus(sessionId) {
  return localConversationLogger.getSessionStatus(sessionId);
}

/**
 * Get all active conversations (useful for admin dashboard)
 */
export function getAllActiveConversations() {
  return localConversationLogger.getActiveSessions();
}

/**
 * Manually capture conversation snapshot
 */
export function captureConversationSnapshot(sessionId, eventType) {
  return localConversationLogger.captureSnapshot(sessionId, eventType);
}

/**
 * Manually end conversation logging
 */
export async function endConversationLogging(sessionId, metadata = {}) {
  return await handleSessionEnd(sessionId, metadata);
}

// Example WebSocket integration
export function setupWebSocketWithLogging(ws, req) {
  // Set up voice agent with logging
  setupVoiceAgentWithLocalLogging(req, null)
    .then(({ sessionId, conversationId, realtimeSession }) => {
      console.log(`WebSocket connected with conversation logging: ${sessionId}`);

      // Connect the RealtimeSession to WebSocket
      realtimeSession.connect({
        apiKey: process.env.OPENAI_API_KEY,
        transport: 'websocket'
      });

      // Handle WebSocket messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          
          if (data.type === 'audio') {
            // Send audio to the agent
            realtimeSession.sendAudio(data.audio);
          } else if (data.type === 'text') {
            // Send text message to the agent
            realtimeSession.sendMessage(data.text);
          } else if (data.type === 'capture_snapshot') {
            // Manually capture conversation snapshot
            captureConversationSnapshot(sessionId, data.eventType || 'manual');
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      // Handle WebSocket close
      ws.on('close', () => {
        console.log(`WebSocket closed for session ${sessionId}`);
        // End conversation logging
        handleSessionEnd(sessionId, { 
          reason: 'websocket_closed',
          endedBy: 'user'
        });
      });

      // Send session info to client
      ws.send(JSON.stringify({
        type: 'session_ready',
        sessionId,
        conversationId,
        status: 'connected'
      }));

    })
    .catch(error => {
      console.error('Error setting up WebSocket with logging:', error);
      ws.close(1011, 'Setup failed');
    });
}

// Example Express.js API endpoints
export function setupAPIEndpoints(app) {
  
  // Start new conversation
  app.post('/api/conversations/start', async (req, res) => {
    try {
      const result = await setupVoiceAgentWithLocalLogging(req, res);
      res.json({
        success: true,
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        status: result.status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // End conversation
  app.post('/api/conversations/:sessionId/end', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const result = await endConversationLogging(sessionId, req.body);
      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get conversation status
  app.get('/api/conversations/:sessionId/status', (req, res) => {
    try {
      const { sessionId } = req.params;
      const status = getConversationStatus(sessionId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
      res.json({
        success: true,
        status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get all active conversations
  app.get('/api/conversations/active', (req, res) => {
    try {
      const conversations = getAllActiveConversations();
      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Capture conversation snapshot
  app.post('/api/conversations/:sessionId/snapshot', (req, res) => {
    try {
      const { sessionId } = req.params;
      const { eventType } = req.body;
      const snapshot = captureConversationSnapshot(sessionId, eventType);
      res.json({
        success: true,
        snapshot
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

export default {
  setupVoiceAgentWithLocalLogging,
  handleSessionEnd,
  getConversationStatus,
  getAllActiveConversations,
  captureConversationSnapshot,
  endConversationLogging,
  setupWebSocketWithLogging,
  setupAPIEndpoints
};
