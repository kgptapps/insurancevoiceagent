import React, { useEffect, useRef } from 'react';
import { ConversationItem } from '../types/insurance';

interface ConversationHistoryProps {
  history: ConversationItem[];
  currentTranscript?: string;
  agentResponse?: string;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({ 
  history, 
  currentTranscript,
  agentResponse 
}) => {
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages are added
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, currentTranscript, agentResponse]);

  const formatTimestamp = (timestamp: Date | string): string => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageIcon = (type: string): string => {
    switch (type) {
      case 'user': return '👤';
      case 'agent': return '🤖';
      case 'system': return '⚙️';
      default: return '💬';
    }
  };

  const getMessageClass = (type: string): string => {
    return `message ${type}-message`;
  };

  return (
    <div className="conversation-history">
      <div className="history-header">
        <h4>Conversation</h4>
        <span className="message-count">{history.length} messages</span>
      </div>
      
      <div className="history-content">
        {history.length === 0 ? (
          <div className="empty-history">
            <p>No conversation yet. Start talking to begin!</p>
          </div>
        ) : (
          <div className="messages">
            {history.map((item) => (
              <div key={item.id} className={getMessageClass(item.type)}>
                <div className="message-header">
                  <span className="message-icon">{getMessageIcon(item.type)}</span>
                  <span className="message-type">
                    {item.type === 'user' ? 'You' : 
                     item.type === 'agent' ? 'Agent' : 'System'}
                  </span>
                  <span className="message-timestamp">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
                <div className="message-content">
                  {item.content}
                </div>
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="message-metadata">
                    {item.metadata.tool && (
                      <span className="metadata-tag">Tool: {item.metadata.tool}</span>
                    )}
                    {item.metadata.event && (
                      <span className="metadata-tag">Event: {item.metadata.event}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {/* Show current transcript if available */}
            {currentTranscript && (
              <div className="message user-message current-transcript">
                <div className="message-header">
                  <span className="message-icon">👤</span>
                  <span className="message-type">You (speaking...)</span>
                  <span className="message-timestamp">now</span>
                </div>
                <div className="message-content">
                  {currentTranscript}
                </div>
              </div>
            )}
            
            {/* Show agent response if available */}
            {agentResponse && (
              <div className="message agent-message current-response">
                <div className="message-header">
                  <span className="message-icon">🤖</span>
                  <span className="message-type">Agent (responding...)</span>
                  <span className="message-timestamp">now</span>
                </div>
                <div className="message-content">
                  {agentResponse}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={historyEndRef} />
      </div>
    </div>
  );
};

export default ConversationHistory;
