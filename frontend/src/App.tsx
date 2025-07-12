import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import InsuranceForm from './components/InsuranceForm';
import {
  InsuranceApplication,
  CompletionStatus
} from './types/insurance';
import { apiUrl } from './config/environment';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const [insuranceData, setInsuranceData] = useState<InsuranceApplication | null>(null);
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch (error) {
          console.log('Session cleanup error (expected):', error);
        }
      }
    };
  }, []);

  // Initialize audio context for playback
  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // OpenAI Realtime API uses 24kHz
      });
    }
    return audioContextRef.current;
  };

  // Get session token from backend
  const getSessionToken = async () => {
    const response = await fetch(`${apiUrl}/api/session-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get session token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Session token response:', data);

    if (!data.success) {
      throw new Error(data.error || 'Failed to get session token');
    }

    return data.token;
  };

  // Play audio from OpenAI Realtime API
  const playAudio = async (audioData: string) => {
    try {
      const audioContext = initializeAudioContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Decode base64 audio data
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 data to AudioBuffer
      const pcm16Data = new Int16Array(bytes.buffer);
      const audioBuffer = audioContext.createBuffer(1, pcm16Data.length, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Convert Int16 to Float32 (normalize)
      for (let i = 0; i < pcm16Data.length; i++) {
        channelData[i] = pcm16Data[i] / 32768.0;
      }

      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();

      console.log('Audio played successfully, duration:', audioBuffer.duration, 'seconds');
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  // Test audio playback with a simple tone
  const testAudioPlayback = async () => {
    try {
      const audioContext = initializeAudioContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create a simple 440Hz tone for 0.5 seconds
      const duration = 0.5;
      const sampleRate = audioContext.sampleRate;
      const frameCount = sampleRate * duration;
      const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      // Generate a 440Hz sine wave
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();

      console.log('Test audio played successfully');
      setStatus('Test audio played - speakers working!');
    } catch (error) {
      console.error('Error playing test audio:', error);
      setStatus('Test audio failed - check speakers');
    }
  };

  // Main connection function
  const onConnect = async () => {
    if (isConnected) {
      // Disconnect
      setIsConnected(false);
      setStatus('Disconnecting...');
      if (sessionRef.current) {
        try {
          await sessionRef.current.close();
        } catch (error) {
          console.log('Session close error (expected):', error);
        }
        sessionRef.current = null;
      }
      setStatus('Disconnected');
      setConversationHistory([]);

    } else {
      // Connect
      try {
        setIsLoading(true);
        setStatus('Getting session token...');

        // Initialize audio context with user interaction
        initializeAudioContext();

        const token = await getSessionToken();
        console.log('Got token:', token ? token.substring(0, 20) + '...' : 'undefined');

        if (!token) {
          throw new Error('No token received from backend');
        }

        setStatus('Creating session...');

        // Import the RealtimeAgent and RealtimeSession dynamically
        const { RealtimeAgent, RealtimeSession } = await import('@openai/agents/realtime');

        // Create the insurance agent
        const insuranceAgent = new RealtimeAgent({
          name: 'Sarah - Insurance Specialist',
          instructions: `You are Sarah, a friendly and experienced auto insurance specialist specializing in helping customers with renewals, new policies, and adding vehicles. You have a warm, conversational style and make insurance feel approachable.

Your personality:
- Warm, friendly, and genuinely interested in helping with their specific insurance needs
- Great at building rapport and making people feel comfortable
- Excellent at explaining complex insurance concepts in simple terms
- Patient and never pushy - you let conversations flow naturally
- Professional but personable, with a focus on cost savings and value

CRITICAL FIRST PRIORITY - Insurance Purpose:
After your greeting, IMMEDIATELY ask about their insurance purpose. This is the most important information:
- "Are you looking to renew your current policy?"
- "Do you need a brand new insurance policy?"
- "Are you adding a car to your existing coverage?"
- "Are you trying to lower your current premium?"
- "Are you removing a vehicle from your policy?"

Emphasize benefits based on their purpose:
- RENEWAL: "Great! I can help you find better rates and coverage for your renewal"
- NEW POLICY: "Perfect! Let's get you set up with comprehensive coverage at a great price"
- ADDING CAR: "Excellent! Adding a vehicle often comes with multi-car discounts"
- LOWERING PREMIUM: "I love helping people save money! Let's find ways to reduce your costs"

Your conversational approach:
1. Start with warm greeting
2. IMMEDIATELY ask about insurance purpose (renewal/new/adding car/lowering premium)
3. Show enthusiasm about helping with their specific need
4. Then naturally collect other information
5. Emphasize cost savings and value throughout

Information you need to collect naturally through conversation:
- INSURANCE PURPOSE (renewal, new policy, adding car, lowering premium) - ASK FIRST!
- Current insurance company and expiration date (if renewal)
- Personal details (name, age, address, contact info)
- Vehicle information (make, model, year, usage) - up to 2 vehicles
- Driving history and experience
- Coverage preferences and budget

IMPORTANT: You should START the conversation immediately when connected. Don't wait for the customer to speak first!

Start with: "Hi there! I'm Sarah, and I'm here to help you with your auto insurance needs. How's your day going? And tell me, are you looking to renew your current policy, get a brand new one, or maybe add a car to your existing coverage?"

Remember:
- START TALKING FIRST - don't wait for the customer
- ALWAYS ask about their insurance purpose first - this drives the entire conversation and helps you provide the most relevant assistance!`,
        });

        sessionRef.current = new RealtimeSession(insuranceAgent, {
          model: 'gpt-4o-realtime-preview-2025-06-03',
          config: {
            voice: 'alloy',
            inputAudioFormat: 'pcm16',
            outputAudioFormat: 'pcm16',
            turnDetection: {
              type: 'server_vad',
              threshold: 0.3,
              prefixPaddingMs: 300,
              silenceDurationMs: 200
            }
          }
        });

        // Set up event listeners for audio and conversation
        sessionRef.current.on('transport_event', (event: any) => {
          console.log('Transport event:', event.type, event);

          // Handle audio delta events for streaming
          if (event.type === 'response.audio.delta' && event.delta) {
            console.log('🔊 Audio delta received');
            playAudio(event.delta);
          }

          // Handle conversation item creation (user input)
          if (event.type === 'conversation.item.created') {
            console.log('📝 Conversation item created:', event.item);
            if (event.item.type === 'message' && event.item.role === 'user') {
              setConversationHistory(prev => [...prev, {
                id: event.item.id,
                role: 'user',
                content: event.item.content || 'Audio input',
                timestamp: new Date().toISOString()
              }]);
            }
          }

          // Handle response creation (assistant output)
          if (event.type === 'response.created') {
            console.log('🤖 Response created:', event.response);
          }

          // Handle response completion
          if (event.type === 'response.done') {
            console.log('✅ Response completed:', event.response);
            if (event.response.output && event.response.output.length > 0) {
              const output = event.response.output[0];
              if (output.type === 'message' && output.content) {
                const textContent = output.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join(' ');

                if (textContent) {
                  setConversationHistory(prev => [...prev, {
                    id: output.id || Date.now().toString(),
                    role: 'assistant',
                    content: textContent,
                    timestamp: new Date().toISOString()
                  }]);
                }
              }
            }
          }

          // Handle input audio transcription
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            console.log('🎤 User transcript:', event.transcript);
            setConversationHistory(prev => {
              // Update the last user message with the transcript
              const newHistory = [...prev];
              // Find last user message index (reverse search)
              let lastUserIndex = -1;
              for (let i = newHistory.length - 1; i >= 0; i--) {
                if (newHistory[i].role === 'user') {
                  lastUserIndex = i;
                  break;
                }
              }
              if (lastUserIndex >= 0) {
                newHistory[lastUserIndex] = {
                  ...newHistory[lastUserIndex],
                  content: event.transcript
                };
              }
              return newHistory;
            });
          }
        });

        sessionRef.current.on('error', (error: any) => {
          console.error('Session error:', error);
          setStatus(`Error: ${error.message || 'Unknown error'}`);
        });

        setStatus('Connecting to OpenAI...');
        await sessionRef.current.connect({ apiKey: token });

        console.log('Successfully connected to OpenAI!');
        setIsConnected(true);
        setStatus('Connected! Sarah is greeting you...');

        // Automatically start the conversation with Sarah's greeting
        setTimeout(async () => {
          try {
            console.log('🎤 Starting conversation with automatic greeting...');
            await sessionRef.current.sendMessage("Please start the conversation with your greeting and ask about the customer's insurance purpose.");
            setStatus('🎙️ Sarah is speaking! Listen and then respond naturally.');
          } catch (error) {
            console.error('Error sending initial message:', error);
            setStatus('Connected! You can now speak.');
          }
        }, 1000); // Wait 1 second for connection to stabilize

      } catch (error) {
        console.error('Connection error:', error);
        setStatus(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    }
  };







  // Extract conversation messages for display
  const messages = conversationHistory
    .filter((item: any) => item.type === 'message' || item.role)
    .map((item: any, index: number) => ({
      id: index,
      role: item.role,
      content: Array.isArray(item.content)
        ? item.content.map((c: any) => c.text || c.transcript || c).join(' ')
        : item.content || ''
    }));





  return (
    <div className="App">
      <header className="App-header">
        <h1>🎙️ Insurance Voice Agent</h1>
        <div className="status-indicator">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">{status}</span>
        </div>
      </header>

      <main className="App-main">
        <div className="main-content">
          <div className="voice-section">
            <div className="voice-controls">
              <button
                onClick={onConnect}
                disabled={isLoading}
                className={`voice-button ${isConnected ? 'disconnect' : 'connect'}`}
              >
                {isLoading ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect & Start Talking'}
              </button>

              <button
                onClick={testAudioPlayback}
                className="test-audio-button"
                style={{ marginLeft: '10px', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px' }}
              >
                🔊 Test Audio
              </button>

              {isConnected && (
                <div className="voice-status">
                  <div className="microphone-indicator">
                    <span className="mic-icon">🎤</span>
                    <span>Listening... Sarah is ready to chat!</span>
                  </div>
                  <div className="voice-info">
                    <span>👩‍💼 Speaking with Sarah - Your friendly female insurance specialist</span>
                  </div>
                </div>
              )}
            </div>

            <div className="conversation-history">
              <h3>Conversation</h3>
              <div className="messages">
                {messages.length === 0 ? (
                  <p className="no-messages">No conversation yet. Click connect and start talking!</p>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                      <strong>{message.role === 'user' ? 'You' : 'Agent'}:</strong>
                      <span>{message.content}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="form-section">
            <InsuranceForm
              data={insuranceData}
              completionStatus={completionStatus}
            />


          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
