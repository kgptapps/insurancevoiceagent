import conversationLogger from './conversationLogger.js';

/**
 * Integration service for OpenAI RealtimeSession with conversation logging
 * This leverages OpenAI's built-in history management and tracing
 */
class RealtimeSessionLogger {
  constructor() {
    this.sessionLoggers = new Map();
  }

  /**
   * Setup logging for a RealtimeSession
   * This integrates with OpenAI's built-in history tracking
   */
  setupSessionLogging(session, sessionId, metadata = {}) {
    // Start conversation logging
    const conversation = conversationLogger.startConversation(sessionId, {
      ...metadata,
      sessionType: 'realtime',
      agentType: 'voice',
      setupTime: new Date().toISOString()
    });

    // Set up event listeners for OpenAI RealtimeSession events
    this.attachSessionEventListeners(session, sessionId);

    this.sessionLoggers.set(sessionId, {
      session,
      conversation,
      lastHistoryLength: 0,
      setupTime: new Date().toISOString(),
      historyCheckInterval: null
    });

    // Set up periodic history checking (every 5 seconds)
    const historyCheckInterval = setInterval(() => {
      this.checkAndCaptureHistory(sessionId);
    }, 5000);

    this.sessionLoggers.get(sessionId).historyCheckInterval = historyCheckInterval;

    console.log(`✅ Setup session logging for ${sessionId}`);
    return conversation;
  }

  /**
   * Attach event listeners to OpenAI RealtimeSession
   */
  attachSessionEventListeners(session, sessionId) {
    console.log(`🎧 Attaching event listeners for session ${sessionId}`);

    // Listen for history updates (OpenAI's built-in feature)
    session.on('history_updated', (history) => {
      console.log(`📝 History updated for session ${sessionId}: ${history.length} items`);
      this.handleHistoryUpdate(sessionId, history);
    });

    // Listen for audio events
    session.on('audio', (audioEvent) => {
      console.log(`🎵 Audio event for session ${sessionId}:`, audioEvent.type);
      conversationLogger.logEvent(sessionId, 'audio_received', {
        type: audioEvent.type,
        timestamp: new Date().toISOString(),
        audioLength: audioEvent.audio ? audioEvent.audio.length : 0
      });
    });

    // Listen for transcript events
    session.on('transcript', (transcriptEvent) => {
      console.log(`📄 Transcript event for session ${sessionId}:`, transcriptEvent.transcript);
      conversationLogger.logEvent(sessionId, 'transcript', {
        transcript: transcriptEvent.transcript,
        speaker: transcriptEvent.speaker || 'user',
        timestamp: new Date().toISOString(),
        confidence: transcriptEvent.confidence
      });
    });

    // Listen for tool calls
    session.on('tool_call', (toolEvent) => {
      console.log(`🔧 Tool call for session ${sessionId}:`, toolEvent.name);
      conversationLogger.logEvent(sessionId, 'tool_call', {
        toolName: toolEvent.name,
        arguments: toolEvent.arguments,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for tool call results
    session.on('tool_call_result', (resultEvent) => {
      console.log(`✅ Tool call result for session ${sessionId}:`, resultEvent.name);
      conversationLogger.logEvent(sessionId, 'tool_call_result', {
        toolName: resultEvent.name,
        result: resultEvent.result,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for agent responses
    session.on('response', (responseEvent) => {
      console.log(`🤖 Agent response for session ${sessionId}:`, responseEvent.type);
      conversationLogger.logEvent(sessionId, 'agent_response', {
        type: responseEvent.type,
        content: responseEvent.content,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for user messages
    session.on('user_message', (messageEvent) => {
      console.log(`👤 User message for session ${sessionId}:`, messageEvent.content);
      conversationLogger.logEvent(sessionId, 'user_message', {
        content: messageEvent.content,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for assistant messages
    session.on('assistant_message', (messageEvent) => {
      console.log(`🤖 Assistant message for session ${sessionId}:`, messageEvent.content);
      conversationLogger.logEvent(sessionId, 'assistant_message', {
        content: messageEvent.content,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for errors
    session.on('error', (error) => {
      conversationLogger.logEvent(sessionId, 'error', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for connection events
    session.on('connected', () => {
      console.log(`🔗 Session connected for ${sessionId}`);
      conversationLogger.logEvent(sessionId, 'session_connected', {
        timestamp: new Date().toISOString()
      });
    });

    session.on('disconnected', () => {
      console.log(`🔌 Session disconnected for ${sessionId}`);
      conversationLogger.logEvent(sessionId, 'session_disconnected', {
        timestamp: new Date().toISOString()
      });
    });

    // Listen for interruptions
    session.on('audio_interrupted', () => {
      console.log(`⏸️ Audio interrupted for ${sessionId}`);
      conversationLogger.logEvent(sessionId, 'audio_interrupted', {
        timestamp: new Date().toISOString()
      });
    });

    // Listen for all events (catch-all for debugging)
    session.on('*', (eventName, eventData) => {
      console.log(`🎯 Event '${eventName}' for session ${sessionId}:`, eventData);
      conversationLogger.logEvent(sessionId, `raw_event_${eventName}`, {
        eventName,
        eventData,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for guardrail events
    session.on('guardrail_tripped', (guardrailEvent) => {
      conversationLogger.logEvent(sessionId, 'guardrail_tripped', {
        guardrailName: guardrailEvent.name,
        reason: guardrailEvent.reason,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle history updates from OpenAI RealtimeSession
   */
  handleHistoryUpdate(sessionId, history) {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      console.warn(`No session logger found for ${sessionId}`);
      return;
    }

    // Only log if history has actually changed
    if (history.length !== sessionLogger.lastHistoryLength) {
      console.log(`📝 History updated for session ${sessionId}: ${history.length} items (was ${sessionLogger.lastHistoryLength})`);
      conversationLogger.logHistorySnapshot(sessionId, history, 'history_updated');
      sessionLogger.lastHistoryLength = history.length;

      // Log the actual history content for debugging
      if (history.length > 0) {
        console.log(`📋 Latest history items:`, history.slice(-2));
      }
    }
  }

  /**
   * Periodically check and capture history (fallback method)
   */
  checkAndCaptureHistory(sessionId) {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      return;
    }

    try {
      // Get current history from OpenAI RealtimeSession
      const currentHistory = sessionLogger.session.history || [];

      if (currentHistory.length > sessionLogger.lastHistoryLength) {
        console.log(`🔄 Periodic history check for session ${sessionId}: found ${currentHistory.length} items (was ${sessionLogger.lastHistoryLength})`);
        this.handleHistoryUpdate(sessionId, currentHistory);
      }
    } catch (error) {
      console.error(`Error during periodic history check for session ${sessionId}:`, error);
    }
  }

  /**
   * Manually capture current session history
   * Useful for periodic snapshots or specific events
   */
  captureSessionHistory(sessionId, eventType = 'manual_snapshot') {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      throw new Error(`No session logger found for ${sessionId}`);
    }

    // Get current history from OpenAI RealtimeSession
    const currentHistory = sessionLogger.session.history || [];
    
    return conversationLogger.logHistorySnapshot(sessionId, currentHistory, eventType);
  }

  /**
   * End session logging and save conversation
   */
  async endSessionLogging(sessionId, finalMetadata = {}) {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      throw new Error(`No session logger found for ${sessionId}`);
    }

    // Capture final history snapshot
    const finalHistory = sessionLogger.session.history || [];
    
    // End conversation logging
    const result = await conversationLogger.endConversation(sessionId, finalHistory, {
      ...finalMetadata,
      endType: 'session_ended',
      finalHistoryLength: finalHistory.length,
      sessionDuration: this.calculateSessionDuration(sessionLogger.setupTime)
    });

    // Clean up interval
    if (sessionLogger.historyCheckInterval) {
      clearInterval(sessionLogger.historyCheckInterval);
    }

    // Clean up
    this.sessionLoggers.delete(sessionId);

    console.log(`🏁 Ended session logging for ${sessionId}`);
    return result;
  }

  /**
   * Get session logging status
   */
  getSessionStatus(sessionId) {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      return null;
    }

    const conversationStatus = conversationLogger.getConversationStatus(sessionId);
    
    return {
      ...conversationStatus,
      sessionSetupTime: sessionLogger.setupTime,
      currentHistoryLength: sessionLogger.session.history ? sessionLogger.session.history.length : 0,
      lastHistoryLength: sessionLogger.lastHistoryLength
    };
  }

  /**
   * Get all active session loggers
   */
  getActiveSessions() {
    return Array.from(this.sessionLoggers.keys()).map(sessionId => 
      this.getSessionStatus(sessionId)
    ).filter(Boolean);
  }

  /**
   * Calculate session duration
   */
  calculateSessionDuration(setupTime) {
    const start = new Date(setupTime);
    const end = new Date();
    const durationMs = end - start;
    
    return {
      milliseconds: durationMs,
      seconds: Math.round(durationMs / 1000),
      formatted: this.formatDuration(durationMs)
    };
  }

  /**
   * Format duration as HH:MM:SS
   */
  formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Export conversation data for analysis
   */
  async exportConversationData(sessionId, format = 'json') {
    const conversationStatus = conversationLogger.getConversationStatus(sessionId);
    if (!conversationStatus) {
      throw new Error(`No conversation found for session ${sessionId}`);
    }

    // This would integrate with the S3 export functionality
    // For now, return the current state
    return {
      sessionId,
      conversationId: conversationStatus.conversationId,
      status: conversationStatus,
      format,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Search conversations by criteria
   */
  searchConversations(criteria = {}) {
    // This would integrate with a search service or database
    // For now, return active conversations that match criteria
    const activeSessions = this.getActiveSessions();
    
    return activeSessions.filter(session => {
      if (criteria.sessionId && session.sessionId !== criteria.sessionId) {
        return false;
      }
      if (criteria.startTimeAfter && new Date(session.startTime) < new Date(criteria.startTimeAfter)) {
        return false;
      }
      if (criteria.minHistoryLength && session.currentHistoryLength < criteria.minHistoryLength) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get conversation analytics
   */
  getConversationAnalytics(sessionId) {
    const sessionLogger = this.sessionLoggers.get(sessionId);
    if (!sessionLogger) {
      return null;
    }

    const history = sessionLogger.session.history || [];
    const conversationStatus = conversationLogger.getConversationStatus(sessionId);
    
    return {
      sessionId,
      conversationId: conversationStatus.conversationId,
      totalMessages: history.length,
      messageTypes: this.analyzeMessageTypes(history),
      conversationFlow: this.analyzeConversationFlow(history),
      duration: this.calculateSessionDuration(sessionLogger.setupTime),
      lastActivity: conversationStatus.lastActivity
    };
  }

  /**
   * Analyze message types in conversation
   */
  analyzeMessageTypes(history) {
    const types = {};
    
    for (const item of history) {
      const type = item.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    }
    
    return types;
  }

  /**
   * Analyze conversation flow patterns
   */
  analyzeConversationFlow(history) {
    const flow = {
      userInitiated: 0,
      agentInitiated: 0,
      toolCalls: 0,
      interruptions: 0
    };
    
    for (const item of history) {
      if (item.type === 'message') {
        if (item.role === 'user') {
          flow.userInitiated++;
        } else if (item.role === 'assistant') {
          flow.agentInitiated++;
        }
      } else if (item.type === 'function_call') {
        flow.toolCalls++;
      }
    }
    
    return flow;
  }
}

// Create singleton instance
const realtimeSessionLogger = new RealtimeSessionLogger();
export default realtimeSessionLogger;
