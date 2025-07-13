import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

/**
 * Local File System Conversation Logger
 * 
 * Leverages OpenAI's RealtimeSession built-in conversation tracking
 * to save conversations and audio to local files instead of S3.
 */
class LocalConversationLogger {
  constructor() {
    // Local file system storage configuration
    this.conversationsDir = process.env.CONVERSATIONS_DIR || path.join(process.cwd(), 'local-conversations');
    this.activeSessions = new Map(); // Track active logging sessions
    
    // Ensure conversations directory exists
    this.ensureConversationsDirectory();
  }

  /**
   * Ensure the conversations directory exists
   */
  async ensureConversationsDirectory() {
    try {
      await fs.mkdir(this.conversationsDir, { recursive: true });
      console.log(`Conversations directory ensured: ${this.conversationsDir}`);
    } catch (error) {
      console.error('Error creating conversations directory:', error);
    }
  }

  /**
   * Start logging a RealtimeSession conversation
   * This leverages OpenAI's built-in history tracking
   */
  startLogging(session, sessionId, metadata = {}) {
    const conversationId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const sessionData = {
      conversationId,
      sessionId,
      session, // Reference to the OpenAI RealtimeSession
      startTime: timestamp,
      endTime: null,
      metadata: {
        ...metadata,
        userAgent: metadata.userAgent || 'unknown',
        ipAddress: metadata.ipAddress || 'unknown',
        sessionStartTime: timestamp
      },
      // Store conversation events and snapshots
      events: [],
      historySnapshots: [],
      audioChunks: [],
      transcripts: []
    };

    this.activeSessions.set(sessionId, sessionData);
    
    // Set up event listeners for OpenAI RealtimeSession
    this.attachEventListeners(session, sessionId);
    
    console.log(`Started local conversation logging for session ${sessionId}, conversation ID: ${conversationId}`);
    return sessionData;
  }

  /**
   * Attach event listeners to OpenAI RealtimeSession
   * This captures all the conversation data automatically
   */
  attachEventListeners(session, sessionId) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    // 1. Listen for history updates (OpenAI's built-in feature)
    session.on('history_updated', (history) => {
      this.logHistoryUpdate(sessionId, history);
    });

    // 2. Listen for new history items
    session.on('history_added', (item) => {
      this.logHistoryItem(sessionId, item);
    });

    // 3. Listen for audio events (if available)
    session.on('audio', (audioEvent) => {
      this.logAudioEvent(sessionId, audioEvent);
    });

    // 4. Listen for transcript events
    session.on('transcript', (transcriptEvent) => {
      this.logTranscriptEvent(sessionId, transcriptEvent);
    });

    // 5. Listen for tool calls
    session.on('tool_call', (toolEvent) => {
      this.logEvent(sessionId, 'tool_call', {
        toolName: toolEvent.name,
        arguments: toolEvent.arguments,
        timestamp: new Date().toISOString()
      });
    });

    // 6. Listen for tool call results
    session.on('tool_call_result', (resultEvent) => {
      this.logEvent(sessionId, 'tool_call_result', {
        toolName: resultEvent.name,
        result: resultEvent.result,
        timestamp: new Date().toISOString()
      });
    });

    // 7. Listen for agent responses
    session.on('response', (responseEvent) => {
      this.logEvent(sessionId, 'agent_response', {
        type: responseEvent.type,
        content: responseEvent.content,
        timestamp: new Date().toISOString()
      });
    });

    // 8. Listen for connection events
    session.on('connected', () => {
      this.logEvent(sessionId, 'session_connected', {
        timestamp: new Date().toISOString()
      });
    });

    session.on('disconnected', () => {
      this.logEvent(sessionId, 'session_disconnected', {
        timestamp: new Date().toISOString()
      });
    });

    // 9. Listen for interruptions
    session.on('audio_interrupted', () => {
      this.logEvent(sessionId, 'audio_interrupted', {
        timestamp: new Date().toISOString()
      });
    });

    // 10. Listen for errors
    session.on('error', (error) => {
      this.logEvent(sessionId, 'error', {
        error: error.message || error,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Log history update from OpenAI RealtimeSession
   */
  logHistoryUpdate(sessionId, history) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    const snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: 'history_update',
      historyLength: history.length,
      history: this.sanitizeHistory(history)
    };

    sessionData.historySnapshots.push(snapshot);
    console.log(`Logged history update for session ${sessionId}: ${history.length} items`);
  }

  /**
   * Log individual history item
   */
  logHistoryItem(sessionId, item) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    this.logEvent(sessionId, 'history_item_added', {
      itemId: item.itemId,
      type: item.type,
      role: item.role,
      content: item.content,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log audio event
   */
  logAudioEvent(sessionId, audioEvent) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    const audioData = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: audioEvent.type,
      audioLength: audioEvent.audio ? audioEvent.audio.length : 0,
      // Store audio data if available (be careful with memory usage)
      hasAudioData: !!audioEvent.audio
    };

    sessionData.audioChunks.push(audioData);
    
    this.logEvent(sessionId, 'audio_received', audioData);
  }

  /**
   * Log transcript event
   */
  logTranscriptEvent(sessionId, transcriptEvent) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    const transcriptData = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      transcript: transcriptEvent.transcript,
      speaker: transcriptEvent.speaker || 'user',
      confidence: transcriptEvent.confidence
    };

    sessionData.transcripts.push(transcriptData);
    
    this.logEvent(sessionId, 'transcript', transcriptData);
  }

  /**
   * Log general event
   */
  logEvent(sessionId, eventType, eventData) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    const event = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: eventType,
      data: eventData
    };

    sessionData.events.push(event);
  }

  /**
   * Manually capture current session history
   * Useful for specific moments like "quote completed"
   */
  captureSnapshot(sessionId, eventType = 'manual_snapshot') {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      throw new Error(`No active session found for ${sessionId}`);
    }

    // Get current history from OpenAI RealtimeSession
    const currentHistory = sessionData.session.history || [];
    
    const snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: eventType,
      historyLength: currentHistory.length,
      history: this.sanitizeHistory(currentHistory)
    };

    sessionData.historySnapshots.push(snapshot);
    console.log(`Captured manual snapshot for session ${sessionId}: ${currentHistory.length} items`);
    
    return snapshot;
  }

  /**
   * Stop logging and save conversation to local files
   */
  async stopLogging(sessionId, finalMetadata = {}) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      throw new Error(`No active session found for ${sessionId}`);
    }

    sessionData.endTime = new Date().toISOString();
    sessionData.metadata = {
      ...sessionData.metadata,
      ...finalMetadata,
      totalEvents: sessionData.events.length,
      totalHistorySnapshots: sessionData.historySnapshots.length,
      totalAudioChunks: sessionData.audioChunks.length,
      totalTranscripts: sessionData.transcripts.length,
      duration: this.calculateDuration(sessionData.startTime, sessionData.endTime)
    };

    try {
      // Save to local file system
      const savedFiles = await this.saveToLocalFiles(sessionData);
      
      // Clean up from memory
      this.activeSessions.delete(sessionId);
      
      console.log(`Conversation completed and saved for session ${sessionId}`);
      return {
        conversationId: sessionData.conversationId,
        sessionId,
        savedFiles,
        metadata: sessionData.metadata
      };
      
    } catch (error) {
      console.error(`Error saving conversation for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save conversation data to local files
   */
  async saveToLocalFiles(sessionData) {
    const { conversationId, sessionId, startTime } = sessionData;
    const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD
    const timePrefix = new Date(startTime).toISOString().replace(/[:.]/g, '-').split('T')[1].split('Z')[0]; // HH-MM-SS-mmm
    
    // Create session directory
    const sessionDir = path.join(this.conversationsDir, datePrefix, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    
    const savedFiles = {};

    // 1. Save complete conversation history (from OpenAI RealtimeSession)
    const finalHistory = sessionData.session.history || [];
    if (finalHistory.length > 0) {
      const conversationFile = `${conversationId}_${timePrefix}_conversation.json`;
      const conversationPath = path.join(sessionDir, conversationFile);
      
      const conversationData = {
        conversationId,
        sessionId,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        metadata: sessionData.metadata,
        finalHistory: this.sanitizeHistory(finalHistory),
        conversationText: this.generateReadableConversation(finalHistory)
      };
      
      await fs.writeFile(conversationPath, JSON.stringify(conversationData, null, 2));
      savedFiles.conversation = { path: conversationPath, filename: conversationFile };
      console.log(`Saved conversation file: ${conversationPath}`);
    }

    // 2. Save readable transcript
    if (sessionData.transcripts.length > 0) {
      const transcriptFile = `${conversationId}_${timePrefix}_transcript.txt`;
      const transcriptPath = path.join(sessionDir, transcriptFile);
      
      const readableTranscript = this.generateReadableTranscript(sessionData.transcripts);
      await fs.writeFile(transcriptPath, readableTranscript);
      savedFiles.transcript = { path: transcriptPath, filename: transcriptFile };
      console.log(`Saved transcript file: ${transcriptPath}`);
    }

    // 3. Save events log
    if (sessionData.events.length > 0) {
      const eventsFile = `${conversationId}_${timePrefix}_events.json`;
      const eventsPath = path.join(sessionDir, eventsFile);
      
      await fs.writeFile(eventsPath, JSON.stringify(sessionData.events, null, 2));
      savedFiles.events = { path: eventsPath, filename: eventsFile };
      console.log(`Saved events file: ${eventsPath}`);
    }

    // 4. Save metadata and summary
    const metadataFile = `${conversationId}_${timePrefix}_metadata.json`;
    const metadataPath = path.join(sessionDir, metadataFile);
    
    const metadataContent = {
      conversationId,
      sessionId,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      metadata: sessionData.metadata,
      statistics: {
        totalEvents: sessionData.events.length,
        totalHistorySnapshots: sessionData.historySnapshots.length,
        totalAudioChunks: sessionData.audioChunks.length,
        totalTranscripts: sessionData.transcripts.length,
        finalHistoryLength: sessionData.session.history ? sessionData.session.history.length : 0
      },
      files: savedFiles
    };
    
    await fs.writeFile(metadataPath, JSON.stringify(metadataContent, null, 2));
    savedFiles.metadata = { path: metadataPath, filename: metadataFile };
    console.log(`Saved metadata file: ${metadataPath}`);

    return savedFiles;
  }

  /**
   * Sanitize history data (remove sensitive information if needed)
   */
  sanitizeHistory(history) {
    return history.map(item => ({
      itemId: item.itemId,
      type: item.type,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp || new Date().toISOString(),
      // Add other relevant fields but exclude sensitive data
    }));
  }

  /**
   * Generate readable conversation from history
   */
  generateReadableConversation(history) {
    return history
      .filter(item => item.type === 'message' && item.content)
      .map(item => {
        const timestamp = item.timestamp || new Date().toISOString();
        const speaker = item.role === 'user' ? 'User' : 'Agent';
        return `[${timestamp}] ${speaker}: ${item.content}`;
      })
      .join('\n');
  }

  /**
   * Generate readable transcript from transcript events
   */
  generateReadableTranscript(transcripts) {
    return transcripts
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(transcript => {
        const speaker = transcript.speaker === 'user' ? 'User' : 'Agent';
        const confidence = transcript.confidence ? ` (${Math.round(transcript.confidence * 100)}%)` : '';
        return `[${transcript.timestamp}] ${speaker}${confidence}: ${transcript.transcript}`;
      })
      .join('\n');
  }

  /**
   * Calculate duration between two timestamps
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
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
   * Get session status
   */
  getSessionStatus(sessionId) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return null;

    return {
      conversationId: sessionData.conversationId,
      sessionId: sessionData.sessionId,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      eventsCount: sessionData.events.length,
      historySnapshotsCount: sessionData.historySnapshots.length,
      audioChunksCount: sessionData.audioChunks.length,
      transcriptsCount: sessionData.transcripts.length,
      currentHistoryLength: sessionData.session.history ? sessionData.session.history.length : 0
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.keys()).map(sessionId => 
      this.getSessionStatus(sessionId)
    ).filter(Boolean);
  }
}

// Create singleton instance
const localConversationLogger = new LocalConversationLogger();
export default localConversationLogger;
