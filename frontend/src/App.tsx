import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import InsuranceForm from './components/InsuranceForm';
import {
  InsuranceApplication,
  CompletionStatus
} from './types/insurance';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const [insuranceData, setInsuranceData] = useState<InsuranceApplication | null>(null);
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [collectedData, setCollectedData] = useState<any>({});
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Uint8Array[]>([]);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup audio context and timeouts on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current);
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

  // Buffer and play accumulated audio chunks
  const playBufferedAudio = async () => {
    if (audioBufferRef.current.length === 0) return;

    try {
      const audioContext = initializeAudioContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Combine all buffered chunks
      const totalLength = audioBufferRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedBuffer = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of audioBufferRef.current) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      console.log('Playing buffered audio, total length:', totalLength);

      // Convert PCM16 data to AudioBuffer
      const pcm16Data = new Int16Array(combinedBuffer.buffer);

      if (pcm16Data.length === 0) {
        console.warn('Empty PCM16 data after buffering');
        return;
      }

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

      console.log('Buffered audio played successfully, duration:', audioBuffer.duration, 'seconds');

      // Clear the buffer after playing
      audioBufferRef.current = [];
    } catch (error) {
      console.error('Error playing buffered audio:', error);
    }
  };

  // Play audio from RealtimeSession audio event
  const playAudioFromEvent = async (event: any) => {
    try {
      console.log('Processing audio event:', {
        type: event.type,
        hasAudio: !!event.audio,
        hasDelta: !!event.delta,
        audioType: typeof event.audio,
        deltaType: typeof event.delta,
        eventKeys: Object.keys(event)
      });

      const audioContext = initializeAudioContext();

      // Resume audio context if suspended (required by browser policies)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      let audioData: ArrayBuffer | null = null;

      // Handle different audio event formats based on OpenAI Realtime API
      if (event.audio) {
        // If audio is base64 encoded string
        if (typeof event.audio === 'string') {
          console.log('Processing base64 audio data, length:', event.audio.length);
          const binaryString = atob(event.audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          audioData = bytes.buffer;
        } else if (event.audio instanceof ArrayBuffer) {
          console.log('Processing ArrayBuffer audio data');
          audioData = event.audio;
        } else if (event.audio instanceof Uint8Array) {
          console.log('Processing Uint8Array audio data');
          audioData = event.audio.buffer;
        } else {
          console.warn('Unknown audio format:', typeof event.audio, event.audio);
          return;
        }
      } else if (event.delta) {
        // Handle delta audio format (incremental audio chunks)
        if (typeof event.delta === 'string') {
          console.log('Processing base64 delta data, length:', event.delta.length);

          // Skip very small or invalid base64 chunks
          if (event.delta.length < 4) {
            console.log('Skipping too small delta chunk:', event.delta.length);
            return;
          }

          // Validate base64 format
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(event.delta)) {
            console.warn('Invalid base64 format in delta:', event.delta);
            return;
          }

          try {
            const binaryString = atob(event.delta);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            // Add to buffer instead of playing immediately
            audioBufferRef.current.push(bytes);
            console.log('Added audio chunk to buffer, buffer size:', audioBufferRef.current.length);

            // Clear any existing timeout
            if (audioTimeoutRef.current) {
              clearTimeout(audioTimeoutRef.current);
            }

            // Set a timeout to play buffered audio after a short delay
            audioTimeoutRef.current = setTimeout(() => {
              playBufferedAudio();
            }, 100); // Wait 100ms for more chunks

            return; // Don't continue with immediate playback
          } catch (error) {
            console.warn('Failed to decode base64 delta:', error, 'Data:', event.delta);
            return;
          }
        } else {
          console.warn('Unknown delta format:', typeof event.delta);
          return;
        }
      } else {
        console.warn('No audio data found in event:', event);
        return;
      }

      if (!audioData || audioData.byteLength === 0) {
        console.warn('Empty audio data');
        return;
      }

      // Convert PCM16 data to AudioBuffer
      const pcm16Data = new Int16Array(audioData);
      console.log('PCM16 data length:', pcm16Data.length);

      if (pcm16Data.length === 0) {
        console.warn('Empty PCM16 data');
        return;
      }

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

  const getSessionToken = async () => {
    const response = await fetch('http://localhost:3001/api/session-token', {
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

  const onConnect = async () => {
    if (isConnected) {
      // Disconnect
      setIsConnected(false);
      setStatus('Disconnecting...');
      await sessionRef.current?.close();
      sessionRef.current = null;
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
          instructions: `You are Sarah, a friendly and experienced auto insurance specialist who genuinely cares about helping people find the right coverage. You have a warm, conversational style and make insurance feel approachable and easy to understand.

Your personality:
- Warm, friendly, and genuinely interested in helping - with a pleasant, professional female voice
- Great at building rapport and making people feel comfortable and at ease
- Excellent at explaining complex insurance concepts in simple, relatable terms
- Patient and never pushy - you let conversations flow naturally with feminine grace
- Professional but personable - like talking to a knowledgeable, caring female friend

Your conversational approach:
- Start with a warm, personal greeting and ask how their day is going
- Show genuine interest in their situation and needs
- Use natural conversation flow - don't just ask questions in sequence
- Share relevant insights and tips that show your expertise
- Use analogies and examples to explain insurance concepts
- Ask follow-up questions that show you're listening
- Acknowledge their concerns and validate their feelings about insurance

Information you need to collect naturally through conversation:
- Personal details (name, age, address, contact info)
- Vehicle information (make, model, year, usage)
- Driving history and experience
- Coverage preferences and budget
- Any specific concerns or priorities

Start with: "Hi there! I'm Sarah, and I'm here to help you find the perfect auto insurance coverage. Before we dive in, how's your day going so far?"

Remember: This should feel like a natural conversation with a helpful expert, not an interrogation. Build trust, show expertise, and make the process enjoyable!`,
        });

        sessionRef.current = new RealtimeSession(insuranceAgent, {
          model: 'gpt-4o-realtime-preview-2025-06-03',
          transport: 'websocket', // Use WebSocket for manual audio handling
          config: {
            voice: 'alloy', // Female voice - warm and professional
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

        // Set up event listeners
        sessionRef.current.on('transport_event', (event: any) => {
          console.log('Transport event:', event);

          // Check for audio-related transport events
          if (event.type && event.type.includes('audio')) {
            console.log('Audio transport event detected:', event);
          }

          // Check for response events that might contain audio
          if (event.type === 'response.audio.delta') {
            console.log('🔊 Audio delta event:', event);
            if (event.delta) {
              playAudioFromEvent(event);
            }
          } else if (event.type === 'response.audio_transcript.delta') {
            console.log('📝 Audio transcript delta (text):', event.delta);
            // This is text transcription, not audio data - don't try to play it
          } else if (event.type === 'response.audio.done') {
            console.log('🔊 Audio response completed');
          } else if (event.type && event.type.includes('audio')) {
            console.log('🎵 Other audio event:', event.type, event);
          }
        });

        sessionRef.current.on('history_updated', (history: any) => {
          console.log('History updated:', history);
          setConversationHistory(history);
        });

        // Handle audio output for WebSocket transport
        sessionRef.current.on('audio', async (event: any) => {
          console.log('Audio event received:', event);
          try {
            await playAudioFromEvent(event);
          } catch (error) {
            console.error('Error playing audio:', error);
          }
        });

        // Listen for all possible audio events
        sessionRef.current.on('audio_output', async (event: any) => {
          console.log('Audio output event:', event);
          try {
            await playAudioFromEvent(event);
          } catch (error) {
            console.error('Error playing audio output:', error);
          }
        });

        // Listen for response events
        sessionRef.current.on('response', (event: any) => {
          console.log('Response event:', event);
        });

        // Listen for conversation updates
        sessionRef.current.on('conversation_updated', (event: any) => {
          console.log('Conversation updated:', event);
        });

        sessionRef.current.on('error', (error: any) => {
          console.error('Session error:', error);
          setStatus(`Error: ${error.message || 'Unknown error'}`);
        });

        setStatus('Connecting to OpenAI...');
        console.log('Attempting to connect with token:', token.substring(0, 20) + '...');

        await sessionRef.current.connect({ apiKey: token });

        console.log('Successfully connected to OpenAI!');
        setIsConnected(true);
        setStatus('Connected! You can now speak.');

      } catch (error) {
        console.error('Connection error:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          error: error
        });
        setStatus(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Extract and parse collected data from conversation
  const extractDataFromConversation = (history: any[]) => {
    const data: any = {};

    // Look for structured data in both user and assistant messages
    history.forEach((item) => {
      if ((item.role === 'user' || item.role === 'assistant') && item.content) {
        const content = Array.isArray(item.content)
          ? item.content.map((c: any) => c.text || c.transcript || '').join(' ')
          : item.content || '';

        // Extract structured information using regex patterns
        const patterns = {
          name: /(?:name is|I'm|my name is|call me|hi I'm|hello I'm)\s+([A-Za-z\s]+)/i,
          age: /(?:age is|I'm|years old|age|born in)\s+(\d+)/i,
          email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
          phone: /(?:phone|number|call me at|reach me at)\s*(?:is\s*)?(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/i,
          address: /(?:live at|address is|located at|I live|reside at|home is)\s+([^.!?]+)/i,
          city: /(?:in|from|live in)\s+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
          vehicle: /(?:drive|car|vehicle|have a|own a)\s+(?:a\s+)?(\d{4})\s+([A-Za-z]+)\s+([A-Za-z]+)/i,
          vehicle_simple: /(?:drive|car|vehicle|have a|own a)\s+(?:a\s+)?([A-Za-z]+)\s+([A-Za-z]+)/i,
          insurance_type: /(?:need|want|looking for|interested in)\s+([^.!?]*insurance[^.!?]*)/i,
          marital_status: /(?:I'm|I am)\s+(married|single|divorced|widowed)/i,
          occupation: /(?:work as|job is|I'm a|occupation is)\s+([^.!?]+)/i,
          driving_years: /(?:driving for|been driving|driving experience)\s+(\d+)\s+years?/i,
          accidents: /(?:had|been in)\s+(\d+)\s+(?:accident|crash)/i,
          tickets: /(?:got|received|had)\s+(\d+)\s+(?:ticket|violation)/i
        };

        Object.entries(patterns).forEach(([key, pattern]) => {
          const match = content.match(pattern);
          if (match) {
            switch (key) {
              case 'name':
                data.personalInfo = { ...data.personalInfo, fullName: match[1].trim() };
                break;
              case 'age':
                data.personalInfo = { ...data.personalInfo, age: parseInt(match[1]) };
                break;
              case 'email':
                data.personalInfo = { ...data.personalInfo, email: match[1] };
                break;
              case 'phone':
                data.personalInfo = { ...data.personalInfo, phone: `${match[1]}-${match[2]}-${match[3]}` };
                break;
              case 'address':
                data.personalInfo = { ...data.personalInfo, address: match[1].trim() };
                break;
              case 'city':
                data.personalInfo = { ...data.personalInfo, city: match[1].trim(), state: match[2] };
                break;
              case 'vehicle':
                data.vehicleInfo = { ...data.vehicleInfo, year: match[1], make: match[2], model: match[3] };
                break;
              case 'vehicle_simple':
                if (!data.vehicleInfo?.year) {
                  data.vehicleInfo = { ...data.vehicleInfo, make: match[1], model: match[2] };
                }
                break;
              case 'insurance_type':
                data.coverageInfo = { ...data.coverageInfo, type: match[1].trim() };
                break;
              case 'marital_status':
                data.personalInfo = { ...data.personalInfo, maritalStatus: match[1] };
                break;
              case 'occupation':
                data.personalInfo = { ...data.personalInfo, occupation: match[1].trim() };
                break;
              case 'driving_years':
                data.drivingHistory = { ...data.drivingHistory, yearsOfExperience: parseInt(match[1]) };
                break;
              case 'accidents':
                data.drivingHistory = { ...data.drivingHistory, accidents: parseInt(match[1]) };
                break;
              case 'tickets':
                data.drivingHistory = { ...data.drivingHistory, tickets: parseInt(match[1]) };
                break;
            }
          }
        });
      }
    });

    return data;
  };

  // Extract conversation messages for display
  const messages = conversationHistory
    .filter((item) => item.type === 'message')
    .map((item, index) => ({
      id: index,
      role: item.role,
      content: Array.isArray(item.content)
        ? item.content.map((c: any) => c.text || c.transcript || JSON.stringify(c)).join(' ')
        : item.content || JSON.stringify(item)
    }));

  // Update collected data when conversation changes
  useEffect(() => {
    const newData = extractDataFromConversation(conversationHistory);
    if (Object.keys(newData).length > 0) {
      newData.lastUpdated = new Date().toLocaleTimeString();
    }
    setCollectedData(newData);
  }, [conversationHistory]);

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
    } catch (error) {
      console.error('Error playing test audio:', error);
    }
  };

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

            <div className="collected-data-section">
              <h3>📋 Collected Information</h3>
              <div className="json-display">
                {Object.keys(collectedData).length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6c757d', fontStyle: 'italic' }}>
                    Information will appear here as you chat with Sarah...
                  </p>
                ) : (
                  <pre>{JSON.stringify(collectedData, null, 2)}</pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
