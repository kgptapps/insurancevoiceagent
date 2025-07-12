import { WebSocketServer } from 'ws';
import { RealtimeSession } from '@openai/agents/realtime';
import sessionManager from './sessionManager.js';
import insuranceAgent from '../agents/insuranceAgent.js';
import realtimeSessionLogger from './realtimeSessionLogger.js';

class VoiceAgentWebSocketServer {
  constructor(port = 3002) {
    this.port = port;
    this.wss = null;
    this.activeSessions = new Map(); // Map of WebSocket -> RealtimeSession
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });
    
    console.log(`WebSocket server starting on port ${this.port}`);

    this.wss.on('connection', (ws, request) => {
      console.log('New WebSocket connection established');
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log(`Voice Agent WebSocket server running on ws://localhost:${this.port}`);
  }

  async handleConnection(ws, request) {
    let sessionId = null;
    let realtimeSession = null;

    try {
      // Set up WebSocket event handlers
      ws.on('message', async (data) => {
        try {
          console.log('Received WebSocket message:', data.toString());
          const message = JSON.parse(data.toString());
          console.log('Parsed message:', message);
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        const sessionData = this.activeSessions.get(ws);
        if (sessionData) {
          console.log(`Cleaning up session ${sessionData.sessionId} on connection close`);
          this.cleanup(sessionData.sessionId, sessionData.realtimeSession).catch(error => {
            console.error('Error during cleanup on close:', error);
          });
          this.activeSessions.delete(ws);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        const sessionData = this.activeSessions.get(ws);
        if (sessionData) {
          console.log(`Cleaning up session ${sessionData.sessionId} on connection error`);
          this.cleanup(sessionData.sessionId, sessionData.realtimeSession).catch(cleanupError => {
            console.error('Error during cleanup on error:', cleanupError);
          });
          this.activeSessions.delete(ws);
        }
      });

      // Send connection confirmation
      console.log('Sending connection confirmation...');
      this.sendMessage(ws, {
        type: 'connection:established',
        payload: {
          message: 'Connected to Voice Agent WebSocket server',
          timestamp: new Date().toISOString()
        }
      });
      console.log('Connection confirmation sent');

      // Auto-start session for testing
      console.log('Auto-starting session for testing...');
      setTimeout(() => {
        this.handleSessionStart(ws, {}).catch(error => {
          console.error('Auto session start failed:', error);
        });
      }, 1000);

    } catch (error) {
      console.error('Error setting up WebSocket connection:', error);
      ws.close();
    }
  }

  async handleMessage(ws, message) {
    const { type, payload } = message;
    console.log(`Handling message type: ${type}`, payload);

    try {
      switch (type) {
        case 'session:start':
          await this.handleSessionStart(ws, payload);
          break;
          
        case 'audio:input':
          await this.handleAudioInput(ws, payload);
          break;
          
        case 'text:input':
          await this.handleTextInput(ws, payload);
          break;
          
        case 'session:end':
          await this.handleSessionEnd(ws, payload);
          break;
          
        case 'session:status':
          await this.handleSessionStatus(ws, payload);
          break;

        case 'test:message':
          await this.handleTestMessage(ws, payload);
          break;

        default:
          console.warn('Unknown message type:', type);
          this.sendError(ws, `Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error(`Error handling message type ${type}:`, error);
      this.sendError(ws, `Error processing ${type}: ${error.message}`);
    }
  }

  async handleSessionStart(ws, payload) {
    try {
      console.log('Starting session with payload:', payload);
      const { sessionId: existingSessionId, config = {} } = payload;

      // Create or retrieve session
      let session;
      if (existingSessionId) {
        console.log('Retrieving existing session:', existingSessionId);
        session = sessionManager.getSession(existingSessionId);
        if (!session) {
          throw new Error('Session not found or expired');
        }
      } else {
        console.log('Creating new session...');
        session = sessionManager.createSession();
        console.log('Session created:', session.id);
      }

      // Create RealtimeSession with OpenAI WebSocket transport
      console.log('Creating RealtimeSession...');
      const realtimeSession = new RealtimeSession(insuranceAgent, {
        model: 'gpt-4o-realtime-preview-2025-06-03',
        config: {
          inputAudioFormat: 'pcm16',
          outputAudioFormat: 'pcm16',
          inputAudioTranscription: {
            model: 'whisper-1'
          },
          turnDetection: {
            type: 'server_vad',
            threshold: 0.3,
            prefixPaddingMs: 300,
            silenceDurationMs: 200
          },
          voice: 'alloy',
          modalities: ['text', 'audio'], // Explicitly enable both text and audio
          instructions: insuranceAgent.instructions, // Make sure instructions are passed
          ...config
        }
      });
      console.log('RealtimeSession created successfully');

      // Setup conversation logging
      console.log('Setting up conversation logging...');
      realtimeSessionLogger.setupSessionLogging(realtimeSession, session.id, {
        userAgent: 'WebSocket Client',
        ipAddress: ws._socket?.remoteAddress || 'unknown',
        sessionType: 'voice_call',
        timestamp: new Date().toISOString()
      });
      console.log('Conversation logging setup complete');

      // Set up RealtimeSession event handlers
      this.setupRealtimeSessionHandlers(ws, realtimeSession, session.id);

      // Connect to OpenAI
      console.log('Connecting to OpenAI...');
      await realtimeSession.connect({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('Connected to OpenAI successfully');

      // Store the session mapping
      this.activeSessions.set(ws, { realtimeSession, sessionId: session.id });

      // Send session started confirmation
      this.sendMessage(ws, {
        type: 'session:started',
        payload: {
          sessionId: session.id,
          status: 'connected',
          message: 'Voice session started successfully'
        }
      });

      // Add initial conversation item
      sessionManager.addConversationItem(
        session.id,
        'system',
        'Voice session started',
        { event: 'session_start' }
      );

      // Session is ready - waiting for user input

      console.log(`Voice session started: ${session.id}`);

    } catch (error) {
      console.error('Error starting session:', error);
      this.sendError(ws, `Failed to start session: ${error.message}`);
    }
  }

  handleAudioOutput(ws, sessionId, audioData) {
    if (!audioData || audioData.length === 0) {
      console.log('No audio data to send');
      return;
    }

    try {
      // Convert audio data properly - it should be base64 encoded PCM16 from OpenAI
      let audioArray;

      if (typeof audioData === 'string') {
        // If it's base64 encoded, decode it
        const buffer = Buffer.from(audioData, 'base64');
        audioArray = Array.from(new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2));
      } else if (audioData instanceof Int16Array) {
        audioArray = Array.from(audioData);
      } else if (audioData instanceof ArrayBuffer) {
        audioArray = Array.from(new Int16Array(audioData));
      } else if (audioData instanceof Uint8Array) {
        const int16Array = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.length / 2);
        audioArray = Array.from(int16Array);
      } else {
        audioArray = Array.from(audioData);
      }

      console.log('Sending audio to frontend, samples:', audioArray.length);
      this.sendMessage(ws, {
        type: 'audio:output',
        payload: {
          sessionId,
          audioData: audioArray,
          format: 'pcm16'
        }
      });
    } catch (error) {
      console.error('Error processing audio output:', error);
    }
  }

  handleConversationItemCreated(ws, sessionId, item) {
    console.log(`📝 Conversation item created for session ${sessionId}:`, item);

    // Add to session conversation history
    if (item.type === 'message') {
      sessionManager.addConversationItem(
        sessionId,
        item.role || 'unknown',
        this.extractContentFromItem(item),
        {
          event: 'conversation_item_created',
          itemId: item.id,
          itemType: item.type,
          timestamp: new Date().toISOString()
        }
      );

      // Send to frontend
      this.sendMessage(ws, {
        type: item.role === 'user' ? 'user:message' : 'agent:message',
        payload: {
          sessionId,
          content: this.extractContentFromItem(item),
          itemId: item.id,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  handleUserTranscript(ws, sessionId, transcript, itemId) {
    console.log(`🎤 User transcript for session ${sessionId}:`, transcript);

    // Add to session conversation history
    sessionManager.addConversationItem(
      sessionId,
      'user',
      transcript,
      {
        event: 'user_transcript_completed',
        itemId: itemId,
        timestamp: new Date().toISOString()
      }
    );

    // Send to frontend
    this.sendMessage(ws, {
      type: 'user:transcript',
      payload: {
        sessionId,
        transcript: transcript,
        itemId: itemId,
        timestamp: new Date().toISOString()
      }
    });
  }

  handleResponseDone(ws, sessionId, response) {
    console.log(`✅ Response completed for session ${sessionId}:`, response);

    // Extract assistant message from response output
    if (response.output && response.output.length > 0) {
      for (const output of response.output) {
        if (output.type === 'message' && output.role === 'assistant') {
          const content = this.extractContentFromItem(output);

          // Add to session conversation history
          sessionManager.addConversationItem(
            sessionId,
            'assistant',
            content,
            {
              event: 'response_done',
              responseId: response.id,
              outputId: output.id,
              timestamp: new Date().toISOString()
            }
          );

          // Send to frontend
          this.sendMessage(ws, {
            type: 'agent:response',
            payload: {
              sessionId,
              message: content,
              responseId: response.id,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    }
  }

  extractContentFromItem(item) {
    if (!item.content) return '';

    if (Array.isArray(item.content)) {
      return item.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join(' ');
    }

    if (typeof item.content === 'string') {
      return item.content;
    }

    if (item.content.text) {
      return item.content.text;
    }

    return JSON.stringify(item.content);
  }

  async handleTestMessage(ws, payload) {
    const { sessionId, message } = payload;
    console.log(`📝 Test message for session ${sessionId}: ${message}`);

    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.error('Session not found for test message:', sessionId);
        return;
      }

      const { realtimeSession } = session;
      if (!realtimeSession) {
        console.error('RealtimeSession not found for test message:', sessionId);
        return;
      }

      // Send a text message to OpenAI to trigger conversation events
      console.log('Sending test message to OpenAI...');
      await realtimeSession.sendUserMessage(message);
      console.log('Test message sent successfully');

    } catch (error) {
      console.error('Error handling test message:', error);
      this.sendError(ws, `Failed to send test message: ${error.message}`);
    }
  }

  setupRealtimeSessionHandlers(ws, realtimeSession, sessionId) {
    // Audio output from agent - try multiple event names
    const audioEvents = ['audio', 'audio_output', 'response.audio', 'response.audio_transcript'];

    audioEvents.forEach(eventName => {
      realtimeSession.on(eventName, (event) => {
        console.log(`Received ${eventName} event from OpenAI:`, {
          type: event?.type,
          hasAudioData: !!event?.audioData,
          hasAudio: !!event?.audio,
          audioDataLength: event?.audioData?.length,
          audioLength: event?.audio?.length
        });

        let audioData = event?.audioData || event?.audio;

        if (audioData && audioData.length > 0) {
          // Convert audio data properly - it should be Int16Array for PCM16
          let audioArray;
          if (audioData instanceof Int16Array) {
            audioArray = Array.from(audioData);
          } else if (audioData instanceof ArrayBuffer) {
            audioArray = Array.from(new Int16Array(audioData));
          } else if (audioData instanceof Uint8Array) {
            // Convert Uint8Array to Int16Array for PCM16
            const int16Array = new Int16Array(audioData.buffer);
            audioArray = Array.from(int16Array);
          } else {
            audioArray = Array.from(audioData);
          }

          console.log('Sending audio to frontend, samples:', audioArray.length);
          this.sendMessage(ws, {
            type: 'audio:output',
            payload: {
              sessionId,
              audioData: audioArray,
              format: 'pcm16'
            }
          });
        } else {
          console.log(`No audio data in ${eventName} event`);
        }
      });
    });

    // Listen for transport events which contain the actual OpenAI responses
    realtimeSession.on('transport_event', (event) => {
      console.log(`Transport event: ${event.type}`, {
        type: event.type,
        hasAudio: !!event.audio,
        audioLength: event.audio?.length,
        hasResponse: !!event.response,
        hasOutput: !!event.output,
        hasDelta: !!event.delta,
        deltaLength: event.delta?.length,
        eventKeys: Object.keys(event)
      });

      // Log the full event for debugging
      if (event.type.includes('audio') || event.type.includes('response')) {
        console.log('Full audio/response event:', JSON.stringify(event, null, 2));
      }

      // Handle audio output from response.audio_transcript.done events
      if (event.type === 'response.audio_transcript.done' && event.audio) {
        console.log('Found audio in response.audio_transcript.done event');
        this.handleAudioOutput(ws, sessionId, event.audio);
      }

      // Handle audio output from response.audio.done events
      if (event.type === 'response.audio.done' && event.audio) {
        console.log('Found audio in response.audio.done event');
        this.handleAudioOutput(ws, sessionId, event.audio);
      }

      // Handle audio delta events for streaming
      if (event.type === 'response.audio.delta' && event.delta) {
        console.log('Found audio delta in response.audio.delta event');
        this.handleAudioOutput(ws, sessionId, event.delta);
      }

      // Handle conversation events for history extraction
      if (event.type === 'conversation.item.created') {
        console.log('📝 Conversation item created:', event.item);
        this.handleConversationItemCreated(ws, sessionId, event.item);
      }

      // Handle user input transcription
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        console.log('🎤 User transcript completed:', event.transcript);
        this.handleUserTranscript(ws, sessionId, event.transcript, event.item_id);
      }

      // Handle response completion with full content
      if (event.type === 'response.done') {
        console.log('✅ Response completed:', event.response);
        this.handleResponseDone(ws, sessionId, event.response);
      }

      // Handle any other audio-related events
      if (event.audio && event.audio.length > 0) {
        console.log(`Found audio in ${event.type} event, length: ${event.audio.length}`);
        this.handleAudioOutput(ws, sessionId, event.audio);
      }

      if (event.delta && typeof event.delta === 'string') {
        console.log(`Found audio delta in ${event.type} event, length: ${event.delta.length}`);
        this.handleAudioOutput(ws, sessionId, event.delta);
      }
    });

    // Listen for all events to debug
    const originalEmit = realtimeSession.emit;
    realtimeSession.emit = function(eventType, ...args) {
      console.log(`RealtimeSession event: ${eventType}`, args[0] ? {
        type: args[0]?.type,
        hasContent: !!args[0]?.content,
        hasAudioData: !!args[0]?.audioData,
        audioDataLength: args[0]?.audioData?.length,
        hasAudio: !!args[0]?.audio,
        audioLength: args[0]?.audio?.length
      } : 'no data');
      return originalEmit.apply(this, arguments);
    };

    // Agent responses and transcripts
    realtimeSession.on('response', (event) => {
      console.log('Received response from OpenAI:', event.content);
      this.sendMessage(ws, {
        type: 'agent:response',
        payload: {
          sessionId,
          message: event.content,
          type: 'response'
        }
      });

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'agent',
        event.content,
        { event: 'agent_response' }
      );
    });

    // User input transcripts
    realtimeSession.on('transcript', (event) => {
      if (event.role === 'user') {
        this.sendMessage(ws, {
          type: 'user:transcript',
          payload: {
            sessionId,
            transcript: event.content
          }
        });

        // Add to conversation history
        sessionManager.addConversationItem(
          sessionId,
          'user',
          event.content,
          { event: 'user_transcript' }
        );
      }
    });

    // Tool calls and data updates
    realtimeSession.on('tool_call', (event) => {
      // Send updated session data to client
      const session = sessionManager.getSession(sessionId);
      if (session) {
        this.sendMessage(ws, {
          type: 'data:updated',
          payload: {
            sessionId,
            data: session.data,
            completionStatus: session.data.completionStatus
          }
        });
      }
    });

    // Session status updates
    realtimeSession.on('status', (event) => {
      this.sendMessage(ws, {
        type: 'session:status',
        payload: {
          sessionId,
          status: event.status,
          message: event.message
        }
      });
    });

    // Error handling
    realtimeSession.on('error', (error) => {
      console.error('RealtimeSession error:', error);
      this.sendMessage(ws, {
        type: 'session:error',
        payload: {
          sessionId,
          error: error.message
        }
      });
    });

    // Add more event listeners for debugging
    realtimeSession.on('connect', () => {
      console.log('RealtimeSession connected event');
    });

    realtimeSession.on('disconnect', () => {
      console.log('RealtimeSession disconnected event');
    });

    realtimeSession.on('message', (event) => {
      console.log('RealtimeSession message event:', event.type);
    });

    // Guardrail violations
    realtimeSession.on('guardrail_tripped', (event) => {
      console.warn('Guardrail tripped:', event);
      this.sendMessage(ws, {
        type: 'guardrail:tripped',
        payload: {
          sessionId,
          guardrail: event.name,
          details: event.details
        }
      });
    });
  }

  async handleAudioInput(ws, payload) {
    const sessionData = this.activeSessions.get(ws);
    if (!sessionData) {
      this.sendError(ws, 'No active session found');
      return;
    }

    const { realtimeSession } = sessionData;
    const { audioData } = payload;

    try {
      // Convert array of 16-bit integers back to ArrayBuffer
      const audioBuffer = new ArrayBuffer(audioData.length * 2); // 2 bytes per 16-bit sample
      const view = new Int16Array(audioBuffer);
      view.set(audioData);

      console.log(`Sending ${audioData.length} audio samples to OpenAI`);
      // Send audio to RealtimeSession
      await realtimeSession.sendAudio(audioBuffer);

      // The RealtimeSession should automatically respond based on turn detection
      // No need to manually trigger response if turn detection is working

    } catch (error) {
      console.error('Error processing audio input:', error);
      this.sendError(ws, 'Error processing audio input');
    }
  }

  async handleTextInput(ws, payload) {
    const sessionData = this.activeSessions.get(ws);
    if (!sessionData) {
      this.sendError(ws, 'No active session found');
      return;
    }

    const { realtimeSession, sessionId } = sessionData;
    const { message } = payload;

    try {
      // Send text message to RealtimeSession
      realtimeSession.sendMessage(message);

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'user',
        message,
        { event: 'text_input' }
      );
    } catch (error) {
      console.error('Error processing text input:', error);
      this.sendError(ws, 'Error processing text input');
    }
  }

  async handleSessionEnd(ws, payload) {
    const sessionData = this.activeSessions.get(ws);
    if (!sessionData) {
      this.sendError(ws, 'No active session found');
      return;
    }

    const { realtimeSession, sessionId } = sessionData;

    try {
      // End conversation logging
      console.log('Ending conversation logging...');
      await realtimeSessionLogger.endSessionLogging(sessionId, {
        endReason: 'user_ended',
        status: 'completed'
      });
      console.log('Conversation logging ended successfully');

      // Disconnect RealtimeSession
      await realtimeSession.disconnect();

      // Update session status
      sessionManager.updateSession(sessionId, { status: 'completed' });

      // Clean up
      this.activeSessions.delete(ws);

      this.sendMessage(ws, {
        type: 'session:ended',
        payload: {
          sessionId,
          message: 'Session ended successfully'
        }
      });

      console.log(`Voice session ended: ${sessionId}`);
    } catch (error) {
      console.error('Error ending session:', error);
      this.sendError(ws, 'Error ending session');
    }
  }

  async handleSessionStatus(ws, payload) {
    const sessionData = this.activeSessions.get(ws);
    if (!sessionData) {
      this.sendError(ws, 'No active session found');
      return;
    }

    const { sessionId } = sessionData;
    const session = sessionManager.getSession(sessionId);

    if (session) {
      this.sendMessage(ws, {
        type: 'session:status',
        payload: {
          sessionId,
          status: session.status,
          data: session.data,
          completionStatus: session.data.completionStatus,
          lastActivity: session.lastActivity
        }
      });
    } else {
      this.sendError(ws, 'Session not found');
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.sendMessage(ws, {
      type: 'error',
      payload: {
        error,
        timestamp: new Date().toISOString()
      }
    });
  }

  async cleanup(sessionId, realtimeSession) {
    try {
      console.log(`Starting cleanup for session: ${sessionId}`);

      // End conversation logging and wait for it to complete
      try {
        const result = await realtimeSessionLogger.endSessionLogging(sessionId, {
          endReason: 'connection_closed',
          status: 'completed'
        });
        console.log(`Conversation logging ended successfully for session ${sessionId}:`, result);
      } catch (error) {
        console.error('Error ending conversation logging during cleanup:', error);
      }

      // Disconnect RealtimeSession
      if (realtimeSession) {
        try {
          await realtimeSession.disconnect();
          console.log(`RealtimeSession disconnected for session ${sessionId}`);
        } catch (error) {
          console.error('Error disconnecting RealtimeSession:', error);
        }
      }

      // Update session status
      try {
        sessionManager.updateSession(sessionId, { status: 'completed' });
        console.log(`Session status updated for session ${sessionId}`);
      } catch (error) {
        console.error('Error updating session status:', error);
      }

      console.log(`Successfully cleaned up session: ${sessionId}`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async stop() {
    if (this.wss) {
      // Clean up all active sessions
      const cleanupPromises = [];
      for (const [ws, sessionData] of this.activeSessions.entries()) {
        cleanupPromises.push(
          this.cleanup(sessionData.sessionId, sessionData.realtimeSession).catch(error => {
            console.error(`Error cleaning up session ${sessionData.sessionId}:`, error);
          })
        );
      }

      // Wait for all cleanups to complete
      await Promise.all(cleanupPromises);

      this.wss.close();
      console.log('WebSocket server stopped');
    }
  }
}

export default VoiceAgentWebSocketServer;
