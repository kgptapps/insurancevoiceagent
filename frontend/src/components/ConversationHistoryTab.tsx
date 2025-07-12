import React, { useState, useEffect } from 'react';
import JsonViewer from './JsonViewer';
import './ConversationHistoryTab.css';

interface ConversationSummary {
  conversationId: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  duration?: {
    formatted: string;
    seconds: number;
  };
  totalEvents: number;
  totalSnapshots: number;
  date: string;
}

interface ConversationDetails {
  conversationId: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  metadata: any;
  historySnapshots: Array<{
    id: string;
    timestamp: string;
    eventType: string;
    history: any[];
    conversationState: any;
  }>;
  events: Array<{
    id: string;
    timestamp: string;
    type: string;
    data: any;
  }>;
}

interface InsuranceData {
  conversationId: string;
  sessionId: string;
  wizsid?: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    primary_phone?: string;
    address?: string;
    zip_code?: string;
    birthdate?: string;
    gender?: string;
    marital_status?: string;
    own_or_rent?: string;
    military_experience?: string;
  };
  coverage?: {
    has_coverage?: string;
    former_insurer?: string;
    former_insurer_name?: string;
    months_insured?: number;
  };
  vehicle?: Array<{
    year?: number;
    make?: string;
    model?: string;
    curatedModel?: string;
    curatedTrim?: string;
    vehicleTypeCode?: string;
  }>;
  driver?: Array<any>;
  product?: string;
  industry?: string;
  numVehicles?: number;
  insuranceNeed?: string;
  currentInsurer?: string;
  currentPremium?: string;
  extractedAt: string;
}

const ConversationHistoryTab: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetails | null>(null);
  const [insuranceData, setInsuranceData] = useState<InsuranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'details'>('list');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/conversations');
      const data = await response.json();
      
      if (data.success) {
        setConversations(data.conversations);
      } else {
        setError(data.error || 'Failed to load conversations');
      }
    } catch (err) {
      setError('Error loading conversations');
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadConversationDetails = async (conversationId: string) => {
    try {
      setLoading(true);
      
      // Load conversation details
      const detailsResponse = await fetch(`/api/conversations/${conversationId}`);
      const detailsData = await detailsResponse.json();
      
      if (detailsData.success) {
        setSelectedConversation(detailsData.conversation);
        
        // Load insurance data
        try {
          const insuranceResponse = await fetch(`/api/conversations/${conversationId}/insurance-data`);
          const insuranceData = await insuranceResponse.json();
          
          if (insuranceData.success) {
            setInsuranceData(insuranceData.insuranceData);
          }
        } catch (err) {
          console.log('No insurance data found for this conversation');
          setInsuranceData(null);
        }
        
        setView('details');
      } else {
        setError(detailsData.error || 'Failed to load conversation details');
      }
    } catch (err) {
      setError('Error loading conversation details');
      console.error('Error loading conversation details:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (duration?: { formatted: string; seconds: number }) => {
    if (!duration) return 'Unknown';
    return duration.formatted;
  };

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'transcript': return '🎤';
      case 'tool_call': return '🔧';
      case 'agent_response': return '🤖';
      case 'audio_received': return '🔊';
      case 'session_connected': return '🔗';
      case 'session_disconnected': return '🔌';
      case 'error': return '❌';
      default: return '📝';
    }
  };

  const renderConversationList = () => (
    <div className="conversation-list">
      <div className="list-header">
        <h2>Voice Conversation History</h2>
        <button onClick={loadConversations} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>
      
      {loading && <div className="loading">Loading conversations...</div>}
      {error && <div className="error">Error: {error}</div>}
      
      {!loading && !error && conversations.length === 0 && (
        <div className="empty-state">
          <p>No conversations found. Start a voice call to see history here!</p>
        </div>
      )}
      
      {!loading && !error && conversations.length > 0 && (
        <div className="conversations-grid">
          {conversations.map((conversation) => (
            <div 
              key={conversation.conversationId} 
              className="conversation-card"
              onClick={() => loadConversationDetails(conversation.conversationId)}
            >
              <div className="card-header">
                <h3>Session {conversation.sessionId.slice(-8)}</h3>
                <span className="conversation-date">
                  {formatDate(conversation.startTime)}
                </span>
              </div>
              
              <div className="card-content">
                <div className="conversation-stats">
                  <div className="stat">
                    <span className="stat-label">Duration:</span>
                    <span className="stat-value">{formatDuration(conversation.duration)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Events:</span>
                    <span className="stat-value">{conversation.totalEvents}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Messages:</span>
                    <span className="stat-value">{conversation.totalSnapshots}</span>
                  </div>
                </div>
              </div>
              
              <div className="card-footer">
                <span className="view-details">Click to view details →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderConversationDetails = () => {
    if (!selectedConversation) return null;

    return (
      <div className="conversation-details">
        <div className="details-header">
          <button onClick={() => setView('list')} className="back-btn">
            ← Back to List
          </button>
          <h2>Conversation Details</h2>
        </div>
        
        <div className="details-content">
          <div className="conversation-info">
            <h3>📊 Conversation Summary</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Session ID:</label>
                <span>{selectedConversation.sessionId}</span>
              </div>
              <div className="info-item">
                <label>Start Time:</label>
                <span>{formatDate(selectedConversation.startTime)}</span>
              </div>
              <div className="info-item">
                <label>End Time:</label>
                <span>{formatDate(selectedConversation.endTime)}</span>
              </div>
              <div className="info-item">
                <label>Duration:</label>
                <span>{formatDuration(selectedConversation.metadata?.duration)}</span>
              </div>
              <div className="info-item">
                <label>Total Events:</label>
                <span>{selectedConversation.events.length}</span>
              </div>
              <div className="info-item">
                <label>History Snapshots:</label>
                <span>{selectedConversation.historySnapshots.length}</span>
              </div>
            </div>
          </div>

          {insuranceData && (
            <div className="insurance-data">
              <JsonViewer
                data={insuranceData}
                title="🚗 QuoteWizard Insurance Data"
                collapsed={false}
                maxHeight="600px"
              />

              {/* Quick Summary for easy viewing */}
              <div className="insurance-summary">
                <h4>📋 Quick Summary</h4>
                <div className="summary-grid">
                  {insuranceData.contact?.first_name && (
                    <div className="summary-item">
                      <label>Name:</label>
                      <span>{insuranceData.contact.first_name} {insuranceData.contact.last_name}</span>
                    </div>
                  )}
                  {insuranceData.contact?.zip_code && (
                    <div className="summary-item">
                      <label>Zip Code:</label>
                      <span>{insuranceData.contact.zip_code}</span>
                    </div>
                  )}
                  {insuranceData.vehicle && insuranceData.vehicle.length > 0 && (
                    <div className="summary-item">
                      <label>Vehicles:</label>
                      <span>
                        {insuranceData.vehicle.map((v, i) =>
                          `${v.year} ${v.make} ${v.model}`
                        ).join(', ')}
                      </span>
                    </div>
                  )}
                  {insuranceData.insuranceNeed && (
                    <div className="summary-item">
                      <label>Need:</label>
                      <span className="need-badge">{insuranceData.insuranceNeed}</span>
                    </div>
                  )}
                  {insuranceData.coverage?.has_coverage && (
                    <div className="summary-item">
                      <label>Current Coverage:</label>
                      <span className={`coverage-badge ${insuranceData.coverage.has_coverage.toLowerCase()}`}>
                        {insuranceData.coverage.has_coverage}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="conversation-events">
            <h3>📝 Conversation Events</h3>
            <div className="events-timeline">
              {selectedConversation.events.map((event) => (
                <div key={event.id} className="event-item">
                  <div className="event-icon">
                    {getEventTypeIcon(event.type)}
                  </div>
                  <div className="event-content">
                    <div className="event-header">
                      <span className="event-type">{event.type}</span>
                      <span className="event-time">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="event-data">
                      {event.type === 'transcript' && event.data.transcript && (
                        <div className="transcript-data">
                          <strong>{event.data.speaker}:</strong> {event.data.transcript}
                          {event.data.confidence && (
                            <span className="confidence"> (confidence: {Math.round(event.data.confidence * 100)}%)</span>
                          )}
                        </div>
                      )}
                      {event.type === 'tool_call' && (
                        <div className="tool-call-data">
                          <strong>Tool:</strong> {event.data.toolName}
                          {event.data.arguments && (
                            <JsonViewer
                              data={event.data.arguments}
                              title={`🔧 ${event.data.toolName} Arguments`}
                              collapsed={true}
                              maxHeight="300px"
                            />
                          )}
                          {event.data.result && (
                            <JsonViewer
                              data={event.data.result}
                              title={`✅ ${event.data.toolName} Result`}
                              collapsed={true}
                              maxHeight="300px"
                            />
                          )}
                        </div>
                      )}
                      {event.type === 'agent_response' && event.data.content && (
                        <div className="response-data">
                          <strong>Response:</strong> {event.data.content}
                        </div>
                      )}
                      {event.type === 'audio_received' && (
                        <div className="audio-data">
                          Audio received: {event.data.audioLength} samples
                        </div>
                      )}
                      {event.type === 'error' && (
                        <div className="error-data">
                          <strong>Error:</strong> {event.data.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="conversation-history-tab">
      {view === 'list' ? renderConversationList() : renderConversationDetails()}
    </div>
  );
};

export default ConversationHistoryTab;
