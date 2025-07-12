import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

/**
 * Enhanced conversation logger using OpenAI's built-in tracing and history management
 * This leverages OpenAI's RealtimeSession history tracking instead of manual audio recording
 */
class ConversationLogger {
  constructor() {
    // Use local storage for development, S3 for production
    this.useLocalStorage = process.env.NODE_ENV === 'development' || !process.env.CONVERSATIONS_BUCKET;
    this.localStorageDir = './local-conversations';

    if (!this.useLocalStorage) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1'
      });
      this.bucketName = process.env.CONVERSATIONS_BUCKET || 'insurance-voice-agent-conversations-production';
    }

    this.activeConversations = new Map();

    // Ensure local storage directory exists
    if (this.useLocalStorage) {
      this.ensureLocalStorageDir();
    }
  }

  async ensureLocalStorageDir() {
    try {
      await fs.mkdir(this.localStorageDir, { recursive: true });
    } catch (error) {
      console.error('Error creating local storage directory:', error);
    }
  }

  /**
   * Start logging a conversation session
   * This integrates with OpenAI's RealtimeSession history tracking
   */
  startConversation(sessionId, metadata = {}) {
    const conversationId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const conversation = {
      conversationId,
      sessionId,
      startTime: timestamp,
      endTime: null,
      metadata: {
        ...metadata,
        userAgent: metadata.userAgent || 'unknown',
        ipAddress: metadata.ipAddress || 'unknown',
        sessionStartTime: timestamp
      },
      // OpenAI RealtimeSession will manage the actual history
      historySnapshots: [],
      events: []
    };

    this.activeConversations.set(sessionId, conversation);
    console.log(`Started conversation logging for session ${sessionId}, conversation ID: ${conversationId}`);
    
    return conversation;
  }

  /**
   * Log a history snapshot from OpenAI RealtimeSession
   * This captures the conversation state at specific points
   */
  logHistorySnapshot(sessionId, history, eventType = 'history_update') {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      console.warn(`No active conversation found for session ${sessionId}`);
      return;
    }

    const snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType,
      historyLength: history.length,
      history: this.sanitizeHistory(history), // Clean sensitive data if needed
      conversationState: this.extractConversationState(history)
    };

    conversation.historySnapshots.push(snapshot);
    console.log(`Logged history snapshot for session ${sessionId}: ${history.length} items`);
    
    return snapshot;
  }

  /**
   * Log specific events (audio, tool calls, handoffs, etc.)
   */
  logEvent(sessionId, eventType, eventData) {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      console.warn(`No active conversation found for session ${sessionId}`);
      return;
    }

    const event = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: eventType,
      data: eventData
    };

    conversation.events.push(event);
    console.log(`Logged event for session ${sessionId}: ${eventType}`);
    
    return event;
  }

  /**
   * Extract meaningful conversation state from OpenAI history
   */
  extractConversationState(history) {
    const state = {
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      lastActivity: null,
      topics: [],
      insuranceData: {}
    };

    for (const item of history) {
      if (item.type === 'message') {
        state.totalMessages++;
        if (item.role === 'user') {
          state.userMessages++;
        } else if (item.role === 'assistant') {
          state.assistantMessages++;
        }
        state.lastActivity = item.timestamp || new Date().toISOString();
      } else if (item.type === 'function_call') {
        state.toolCalls++;
      }

      // Extract insurance-specific data
      if (item.content) {
        this.extractInsuranceData(item.content, state.insuranceData);
      }
    }

    return state;
  }



  /**
   * Sanitize history to remove sensitive data if needed
   */
  sanitizeHistory(history) {
    return history.map(item => {
      const sanitized = { ...item };
      
      // Remove or mask sensitive data based on your requirements
      if (sanitized.content && typeof sanitized.content === 'string') {
        // Example: mask phone numbers
        sanitized.content = sanitized.content.replace(
          /\d{3}[-.]?\d{3}[-.]?\d{4}/g, 
          'XXX-XXX-XXXX'
        );
        // Example: mask email addresses
        sanitized.content = sanitized.content.replace(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          'user@example.com'
        );
      }
      
      return sanitized;
    });
  }

  /**
   * End conversation and save to S3
   */
  async endConversation(sessionId, finalHistory = [], finalMetadata = {}) {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation found for session ${sessionId}`);
    }

    conversation.endTime = new Date().toISOString();
    conversation.metadata = {
      ...conversation.metadata,
      ...finalMetadata,
      totalHistorySnapshots: conversation.historySnapshots.length,
      totalEvents: conversation.events.length,
      duration: this.calculateDuration(conversation.startTime, conversation.endTime)
    };

    // Add final history snapshot
    if (finalHistory.length > 0) {
      this.logHistorySnapshot(sessionId, finalHistory, 'conversation_end');
    }

    try {
      // Save conversation data
      const saveResults = this.useLocalStorage
        ? await this.saveToLocalStorage(conversation)
        : await this.saveToS3(conversation);
      
      // Clean up from memory
      this.activeConversations.delete(sessionId);
      
      console.log(`Conversation completed and saved for session ${sessionId}`);
      return {
        conversationId: conversation.conversationId,
        sessionId,
        s3Results: saveResults,
        metadata: conversation.metadata
      };
      
    } catch (error) {
      console.error(`Error saving conversation for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save conversation data to local storage
   */
  async saveToLocalStorage(conversation) {
    const { conversationId, sessionId, startTime } = conversation;
    const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD

    const results = {
      conversationFile: null,
      summaryFile: null,
      insuranceDataFile: null
    };

    try {
      // Create directory structure
      const sessionDir = path.join(this.localStorageDir, datePrefix, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      // 1. Save complete conversation data
      const conversationFile = path.join(sessionDir, `${conversationId}_conversation.json`);
      const conversationData = {
        ...conversation,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      await fs.writeFile(conversationFile, JSON.stringify(conversationData, null, 2));
      results.conversationFile = { path: conversationFile };

      // 2. Save conversation summary
      const summary = this.generateConversationSummary(conversation);
      const summaryFile = path.join(sessionDir, `${conversationId}_summary.json`);
      await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
      results.summaryFile = { path: summaryFile };



      console.log(`💾 Conversation saved locally: ${sessionDir}`);
      return results;

    } catch (error) {
      console.error('Error saving conversation locally:', error);
      throw new Error(`Failed to save conversation locally: ${error.message}`);
    }
  }

  /**
   * Save conversation data to S3
   */
  async saveToS3(conversation) {
    const { conversationId, sessionId, startTime } = conversation;
    const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD
    
    const results = {
      conversationFile: null,
      summaryFile: null,
      insuranceDataFile: null
    };

    try {
      // 1. Save complete conversation data
      const conversationKey = `conversations/${datePrefix}/${sessionId}/${conversationId}_conversation.json`;
      const conversationData = {
        ...conversation,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };
      
      await this.uploadToS3(
        conversationKey, 
        Buffer.from(JSON.stringify(conversationData, null, 2)),
        'application/json'
      );
      
      results.conversationFile = {
        key: conversationKey,
        url: `s3://${this.bucketName}/${conversationKey}`
      };

      // 2. Save conversation summary
      const summary = this.generateConversationSummary(conversation);
      const summaryKey = `conversations/${datePrefix}/${sessionId}/${conversationId}_summary.json`;
      
      await this.uploadToS3(
        summaryKey,
        Buffer.from(JSON.stringify(summary, null, 2)),
        'application/json'
      );
      
      results.summaryFile = {
        key: summaryKey,
        url: `s3://${this.bucketName}/${summaryKey}`
      };



      return results;
      
    } catch (error) {
      console.error('Error uploading conversation to S3:', error);
      throw new Error(`Failed to save conversation to S3: ${error.message}`);
    }
  }

  /**
   * Upload data to S3
   */
  async uploadToS3(key, data, contentType) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'service': 'insurance-voice-agent',
        'version': '1.0'
      }
    });

    const result = await this.s3Client.send(command);
    console.log(`Uploaded to S3: s3://${this.bucketName}/${key}`);
    return result;
  }

  /**
   * Generate conversation summary
   */
  generateConversationSummary(conversation) {
    const latestSnapshot = conversation.historySnapshots[conversation.historySnapshots.length - 1];
    const state = latestSnapshot ? latestSnapshot.conversationState : {};
    
    return {
      conversationId: conversation.conversationId,
      sessionId: conversation.sessionId,
      startTime: conversation.startTime,
      endTime: conversation.endTime,
      duration: conversation.metadata.duration,
      statistics: {
        totalMessages: state.totalMessages || 0,
        userMessages: state.userMessages || 0,
        assistantMessages: state.assistantMessages || 0,
        toolCalls: state.toolCalls || 0,
        historySnapshots: conversation.historySnapshots.length,
        events: conversation.events.length
      },
      lastActivity: state.lastActivity,
      topics: state.topics || [],
      metadata: conversation.metadata
    };
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
   * Get conversation status
   */
  getConversationStatus(sessionId) {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      return null;
    }

    return {
      conversationId: conversation.conversationId,
      sessionId: conversation.sessionId,
      startTime: conversation.startTime,
      historySnapshots: conversation.historySnapshots.length,
      events: conversation.events.length,
      lastActivity: conversation.historySnapshots.length > 0 
        ? conversation.historySnapshots[conversation.historySnapshots.length - 1].timestamp
        : conversation.startTime
    };
  }

  /**
   * List all active conversations
   */
  getActiveConversations() {
    return Array.from(this.activeConversations.values()).map(conversation => ({
      conversationId: conversation.conversationId,
      sessionId: conversation.sessionId,
      startTime: conversation.startTime,
      historySnapshots: conversation.historySnapshots.length,
      events: conversation.events.length
    }));
  }
}

// Create singleton instance
const conversationLogger = new ConversationLogger();
export default conversationLogger;
