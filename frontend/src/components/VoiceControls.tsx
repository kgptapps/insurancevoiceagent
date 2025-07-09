import React, { useState, useEffect } from 'react';
import audioService from '../services/audioService';
import websocketService from '../services/websocketService';

interface VoiceControlsProps {
  sessionId: string | null;
  isConnected: boolean;
  onStatusChange: (status: string) => void;
}

const VoiceControls: React.FC<VoiceControlsProps> = ({ 
  sessionId, 
  isConnected, 
  onStatusChange 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    initializeAudio();
    return () => {
      audioService.cleanup();
    };
  }, []);

  const initializeAudio = async () => {
    try {
      // Check microphone permission first
      const hasPermission = await audioService.checkMicrophonePermission();
      setMicPermission(hasPermission);

      if (hasPermission) {
        await audioService.initialize();
        setIsInitialized(true);
        onStatusChange('Audio initialized');
      } else {
        onStatusChange('Microphone permission required');
      }
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      onStatusChange('Failed to initialize audio');
      setMicPermission(false);
    }
  };

  const startRecording = async () => {
    if (!sessionId || !isConnected || !isInitialized) {
      onStatusChange('Cannot start recording: session not ready');
      return;
    }

    try {
      await audioService.startRecording((audioData) => {
        // Send audio data to backend via WebSocket
        websocketService.sendAudio(sessionId, audioData);
      });
      
      setIsRecording(true);
      onStatusChange('Recording...');
    } catch (error) {
      console.error('Failed to start recording:', error);
      onStatusChange('Failed to start recording');
    }
  };

  const stopRecording = () => {
    audioService.stopRecording();
    setIsRecording(false);
    onStatusChange('Recording stopped');
  };

  const sendTextMessage = () => {
    if (!sessionId || !isConnected || !textInput.trim()) {
      return;
    }

    websocketService.sendText(sessionId, textInput.trim());
    setTextInput('');
    onStatusChange('Text message sent');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission(true);
      initializeAudio();
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setMicPermission(false);
      onStatusChange('Microphone permission denied');
    }
  };

  if (micPermission === false) {
    return (
      <div className="voice-controls">
        <div className="permission-request">
          <p>Microphone access is required for voice interaction.</p>
          <button 
            onClick={requestMicrophonePermission}
            className="permission-button"
          >
            Grant Microphone Permission
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-controls">
      <div className="voice-buttons">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isConnected || !isInitialized || !sessionId}
          className={`voice-button ${isRecording ? 'recording' : ''}`}
        >
          {isRecording ? (
            <>
              <span className="recording-indicator">🔴</span>
              Stop Recording
            </>
          ) : (
            <>
              <span className="mic-icon">🎤</span>
              Start Recording
            </>
          )}
        </button>

        <button
          onClick={() => websocketService.getSessionStatus(sessionId!)}
          disabled={!isConnected || !sessionId}
          className="status-button"
        >
          Get Status
        </button>
      </div>

      <div className="text-input-section">
        <div className="text-input-container">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message or use voice..."
            disabled={!isConnected || !sessionId}
            rows={2}
            className="text-input"
          />
          <button
            onClick={sendTextMessage}
            disabled={!isConnected || !sessionId || !textInput.trim()}
            className="send-button"
          >
            Send
          </button>
        </div>
      </div>

      <div className="connection-status">
        <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '🟢' : '🔴'}
        </span>
        <span className="status-text">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {sessionId && (
          <span className="session-id">
            Session: {sessionId.substring(0, 8)}...
          </span>
        )}
      </div>
    </div>
  );
};

export default VoiceControls;
