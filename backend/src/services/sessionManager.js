import { v4 as uuidv4 } from 'uuid';
import { createEmptyApplication, VoiceSessionSchema } from '../types/insurance.js';

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 1800000; // 30 minutes
    this.maxSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 50;
    
    // Cleanup expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 300000);
  }

  createSession(userId = null) {
    // Check if we've reached max sessions
    if (this.sessions.size >= this.maxSessions) {
      throw new Error('Maximum concurrent sessions reached');
    }

    const sessionId = uuidv4();
    const agentId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTimeout);

    const session = {
      id: sessionId,
      userId,
      agentId,
      status: 'active',
      data: createEmptyApplication(sessionId),
      conversationHistory: [],
      createdAt: now,
      lastActivity: now,
      expiresAt
    };

    // Validate session structure
    const validatedSession = VoiceSessionSchema.parse(session);
    this.sessions.set(sessionId, validatedSession);

    console.log(`Created new session: ${sessionId}`);
    return validatedSession;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      this.deleteSession(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    return session;
  }

  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update the session data
    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: new Date(),
      lastActivity: new Date()
    };

    // Validate updated session
    const validatedSession = VoiceSessionSchema.parse(updatedSession);
    this.sessions.set(sessionId, validatedSession);

    return validatedSession;
  }

  updateSessionData(sessionId, dataUpdates) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Deep merge the data updates
    const updatedData = {
      ...session.data,
      ...dataUpdates,
      updatedAt: new Date()
    };

    // Calculate completion status
    updatedData.completionStatus = this.calculateCompletionStatus(updatedData);

    return this.updateSession(sessionId, { data: updatedData });
  }

  addConversationItem(sessionId, type, content, metadata = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const conversationItem = {
      id: uuidv4(),
      type,
      content,
      timestamp: new Date(),
      metadata
    };

    session.conversationHistory.push(conversationItem);
    session.lastActivity = new Date();

    this.sessions.set(sessionId, session);
    return conversationItem;
  }

  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      console.log(`Deleted session: ${sessionId}`);
    }
    return deleted;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }

  cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  calculateCompletionStatus(data) {
    const status = {
      personalInfo: 0,
      vehicleInfo: 0,
      coveragePrefs: 0,
      drivingHistory: 0,
      overall: 0
    };

    // Calculate personal info completion
    const personalFields = ['firstName', 'lastName', 'dateOfBirth', 'address', 'phone', 'email'];
    const personalCompleted = personalFields.filter(field => {
      if (field === 'address') {
        return data.personalInfo?.address?.street && data.personalInfo?.address?.city;
      }
      return data.personalInfo?.[field];
    }).length;
    status.personalInfo = Math.round((personalCompleted / personalFields.length) * 100);

    // Calculate vehicle info completion
    const vehicleFields = ['make', 'model', 'year', 'vin', 'currentMileage', 'annualMileage'];
    const vehicleCompleted = vehicleFields.filter(field => data.vehicleInfo?.[field]).length;
    status.vehicleInfo = Math.round((vehicleCompleted / vehicleFields.length) * 100);

    // Calculate coverage preferences completion
    const coverageCompleted = (data.coveragePrefs?.liabilityLimits ? 1 : 0) +
                             (data.coveragePrefs?.comprehensive ? 1 : 0) +
                             (data.coveragePrefs?.collision ? 1 : 0);
    status.coveragePrefs = Math.round((coverageCompleted / 3) * 100);

    // Calculate driving history completion
    const drivingFields = ['licenseNumber', 'licenseState', 'yearsLicensed'];
    const drivingCompleted = drivingFields.filter(field => data.drivingHistory?.[field]).length;
    status.drivingHistory = Math.round((drivingCompleted / drivingFields.length) * 100);

    // Calculate overall completion
    status.overall = Math.round((status.personalInfo + status.vehicleInfo + status.coveragePrefs + status.drivingHistory) / 4);

    return status;
  }

  extendSession(sessionId, additionalTime = null) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const extension = additionalTime || this.sessionTimeout;
    session.expiresAt = new Date(Date.now() + extension);
    session.lastActivity = new Date();

    this.sessions.set(sessionId, session);
    return session;
  }
}

// Create singleton instance
const sessionManager = new SessionManager();
export default sessionManager;
