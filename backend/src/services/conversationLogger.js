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
   * Extract insurance-related information from conversation content
   * Format data according to QuoteWizard structure
   */
  extractInsuranceData(content, insuranceData) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);

    // Initialize QuoteWizard-compatible structure if not exists
    if (!insuranceData.contact) insuranceData.contact = {};
    if (!insuranceData.coverage) insuranceData.coverage = {};
    if (!insuranceData.vehicle) insuranceData.vehicle = [];
    if (!insuranceData.driver) insuranceData.driver = [];

    // Extract specific insurance fields based on QuoteWizard format
    const patterns = {
      // Contact information
      zipCode: /(?:zip|postal|zip code).*?(\d{5})/i,
      firstName: /(?:first name|my name is).*?([a-zA-Z]+)/i,
      lastName: /(?:last name|surname).*?([a-zA-Z]+)/i,
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      phoneNumber: /(?:phone|number|call me).*?(\d{3}[-.]?\d{3}[-.]?\d{4})/i,
      streetAddress: /(?:address|live at|street).*?(\d+\s+[a-zA-Z0-9\s,]+)/i,

      // Demographics
      gender: /(?:gender|i am|i'm).*?(male|female|non-binary|man|woman)/i,
      maritalStatus: /(?:married|single|spouse|husband|wife)/i,
      homeOwnership: /(?:own|rent|homeowner|renter).*?(home|house)/i,
      militaryService: /(?:military|veteran|active duty|discharged)/i,
      birthDate: /(?:birth|born|birthday).*?(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,

      // Insurance history
      hasInsurance30Days: /(?:insurance for|had insurance).*?(30 days|month|yes|no)/i,
      formerInsurer: /(?:current|previous|former).*?insurance.*?(allstate|state farm|geico|progressive|nationwide|farmers|liberty mutual|usaa)/i,

      // Vehicle information
      vehicleCount: /(?:how many vehicles|number of vehicles).*?(\d+)/i,
      vehicleYear: /(?:year|model year).*?(\d{4})/i,
      vehicleMake: /(?:make|manufacturer).*?([a-zA-Z]+)/i,
      vehicleModel: /(?:model).*?([a-zA-Z0-9\s]+)/i,

      // Insurance needs
      insuranceNeed: /(?:looking for|need|want).*?(new|renewal|adding|removing|lower|cheaper)/i
    };

    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        let value = match[1];

        // Map to QuoteWizard structure
        switch (field) {
          case 'zipCode':
            insuranceData.contact.zip_code = value;
            break;
          case 'firstName':
            insuranceData.contact.first_name = value;
            break;
          case 'lastName':
            insuranceData.contact.last_name = value;
            break;
          case 'email':
            insuranceData.contact.email = value;
            break;
          case 'phoneNumber':
            insuranceData.contact.primary_phone = value;
            break;
          case 'streetAddress':
            insuranceData.contact.address = value;
            break;
          case 'gender':
            value = value.toLowerCase();
            if (value.includes('male') && !value.includes('female')) value = 'male';
            else if (value.includes('female')) value = 'female';
            else if (value.includes('non-binary')) value = 'non-binary';
            insuranceData.contact.gender = value;
            break;
          case 'maritalStatus':
            value = value.toLowerCase().includes('married') ? 'MARRIED' : 'SINGLE';
            insuranceData.contact.marital_status = value;
            break;
          case 'homeOwnership':
            value = value.toLowerCase().includes('own') ? 'own' : 'rent';
            insuranceData.contact.own_or_rent = value;
            break;
          case 'militaryService':
            insuranceData.contact.military_experience = value.toLowerCase().includes('yes') ||
              value.toLowerCase().includes('veteran') ||
              value.toLowerCase().includes('active') ? 'yes' : 'no';
            break;
          case 'birthDate':
            insuranceData.contact.birthdate = value;
            break;
          case 'hasInsurance30Days':
            insuranceData.coverage.has_coverage = value.toLowerCase().includes('yes') ||
              value.toLowerCase().includes('30') ||
              value.toLowerCase().includes('month') ? 'YES' : 'NO';
            break;
          case 'formerInsurer':
            insuranceData.coverage.former_insurer = value.toUpperCase();
            insuranceData.coverage.former_insurer_name = value;
            break;
          case 'vehicleCount':
            insuranceData.numVehicles = parseInt(value);
            break;
          case 'insuranceNeed':
            insuranceData.insuranceNeed = value.toLowerCase();
            break;
        }
      }
    }

    // Extract from tool call results and map to QuoteWizard structure
    if (typeof content === 'object') {
      if (content.vehicleInfo) {
        const vehicle = {
          year: parseInt(content.vehicleInfo.year),
          make: content.vehicleInfo.make.toUpperCase(),
          model: content.vehicleInfo.model.toUpperCase(),
          curatedModel: content.vehicleInfo.model,
          curatedTrim: content.vehicleInfo.trim || 'Base',
          vehicleTypeCode: 'P' // Default to passenger vehicle
        };

        // Add or update vehicle in array
        const vehicleIndex = (content.vehicleInfo.vehicleNumber || 1) - 1;
        insuranceData.vehicle[vehicleIndex] = vehicle;
      }

      if (content.personalInfo) {
        Object.assign(insuranceData.contact, {
          first_name: content.personalInfo.firstName,
          last_name: content.personalInfo.lastName,
          email: content.personalInfo.email,
          primary_phone: content.personalInfo.phone,
          address: content.personalInfo.streetAddress,
          zip_code: content.personalInfo.zipCode,
          birthdate: content.personalInfo.birthDate,
          gender: content.personalInfo.gender,
          marital_status: content.personalInfo.maritalStatus === 'married' ? 'MARRIED' : 'SINGLE',
          own_or_rent: content.personalInfo.homeOwnership,
          military_experience: content.personalInfo.militaryService
        });

        if (content.personalInfo.hasInsurance30Days !== undefined) {
          insuranceData.coverage.has_coverage = content.personalInfo.hasInsurance30Days ? 'YES' : 'NO';
        }
      }

      if (content.needType) {
        insuranceData.insuranceNeed = content.needType;
        insuranceData.currentInsurer = content.currentInsurer;
        insuranceData.currentPremium = content.currentPremium;
      }
    }

    // Set product type
    insuranceData.product = 'auto';
    insuranceData.industry = 'insurance';
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

      // 3. Save extracted insurance data
      const insuranceData = this.extractInsuranceDataFromConversation(conversation);
      if (Object.keys(insuranceData).length > 0) {
        const insuranceFile = path.join(sessionDir, `${conversationId}_insurance_data.json`);
        await fs.writeFile(insuranceFile, JSON.stringify(insuranceData, null, 2));
        results.insuranceDataFile = { path: insuranceFile };
      }

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

      // 3. Save extracted insurance data
      const insuranceData = this.extractInsuranceDataFromConversation(conversation);
      if (Object.keys(insuranceData).length > 0) {
        const insuranceKey = `conversations/${datePrefix}/${sessionId}/${conversationId}_insurance_data.json`;
        
        await this.uploadToS3(
          insuranceKey,
          Buffer.from(JSON.stringify(insuranceData, null, 2)),
          'application/json'
        );
        
        results.insuranceDataFile = {
          key: insuranceKey,
          url: `s3://${this.bucketName}/${insuranceKey}`
        };
      }

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
   * Extract insurance data from entire conversation
   */
  extractInsuranceDataFromConversation(conversation) {
    const insuranceData = {};
    
    // Aggregate insurance data from all history snapshots
    for (const snapshot of conversation.historySnapshots) {
      if (snapshot.conversationState && snapshot.conversationState.insuranceData) {
        Object.assign(insuranceData, snapshot.conversationState.insuranceData);
      }
    }
    
    return {
      ...insuranceData,
      extractedAt: new Date().toISOString(),
      conversationId: conversation.conversationId,
      sessionId: conversation.sessionId
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
