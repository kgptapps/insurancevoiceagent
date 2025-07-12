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
  const [collectedData, setCollectedData] = useState<any>({});
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
      setCollectedData({});
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

  // Extract insurance data from conversation
  const extractDataFromConversation = (history: any[]) => {
    const data: any = {
      conversationLength: history.length,
      lastUpdated: new Date().toLocaleTimeString(),
      extractedInfo: {}
    };

    // Combine all conversation text for analysis
    const allText = history
      .map(item => item.content || '')
      .join(' ');

    console.log('Analyzing text for extraction:', allText);

    // Extract comprehensive insurance information using improved patterns
    const patterns = {
      // INSURANCE PURPOSE - HIGHEST PRIORITY
      insurance_purpose_renewal: /(?:looking to renew|want to renew|need to renew|renewing|renewal|my policy expires|policy is expiring|current policy|existing policy)/i,
      insurance_purpose_new: /(?:need new|want new|looking for new|new policy|new insurance|first time|never had|don't have|no insurance|new coverage)/i,
      insurance_purpose_adding_car: /(?:adding a car|add a car|adding vehicle|add vehicle|second car|another car|additional car|new car|just bought|recently purchased)/i,
      insurance_purpose_lowering_premium: /(?:lower|reduce|cheaper|save money|cut costs|better rate|lower premium|less expensive|find savings)/i,
      insurance_purpose_removing_car: /(?:removing|remove|taking off|sold|getting rid of|no longer have|don't need)/i,

      // Personal Information
      name: /(?:name is|i'm|my name is|call me|hi i'm|hello i'm)\s+([a-zA-Z\s]+?)(?:\s|$|\.|\,)/i,
      age: /(?:age is|i'm|years old|age|born in)\s+(\d+)/i,
      birth_date: /(?:born on|birthday is|birth date|born)\s+([a-zA-Z0-9\/\-\s]+)/i,
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      phone: /(?:phone|number|call me at|reach me at)\s*(?:is\s*)?(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/i,
      ssn: /(?:social security|ssn|social)\s*(?:number|is)?\s*(\d{3}[-.\s]?\d{2}[-.\s]?\d{4})/i,

      // Address Information
      address: /(?:live at|address is|located at)\s+([^.!?]+)/i,
      city: /(?:live in|from|in|located in|city is)\s+([a-zA-Z\s]+?)(?:\s|$|\.|\,)/i,
      state: /(?:state|in)\s+([A-Z]{2}|[a-zA-Z\s]+?)(?:\s|$|\.|\,)/i,
      zip_code: /(?:zip code|zip|postal code)\s*(?:is\s*)?(\d{5}(?:-\d{4})?)/i,

      // Personal Details
      marital_status: /(?:i'm|i am)\s+(married|single|divorced|widowed)/i,
      occupation: /(?:work as|job is|i'm a|occupation is|work at|employed as)\s+([^.!?]+)/i,

      // Driver's License
      license_number: /(?:license number|driver's license|dl number)\s*(?:is\s*)?([a-zA-Z0-9]+)/i,
      license_state: /(?:license from|licensed in)\s+([a-zA-Z\s]+)/i,

      // Vehicle Information - Enhanced patterns for multiple vehicles
      vehicle_year_make_model: /(?:drive|car|vehicle|have a|own a|driving a|got a|second car|other car|also have|another car|my wife drives|husband drives|it's|its)\s+(?:a\s+)?(\d{4})\s+([a-zA-Z]+)\s+([a-zA-Z]+)/gi,
      vehicle_make_model: /(?:drive|car|vehicle|have a|own a|driving a|got a|second car|other car|also have|another car|my wife drives|husband drives|it's|its)\s+(?:a\s+)?([a-zA-Z]+)\s+([a-zA-Z]+)(?:\s|$|\.|\,)/gi,
      vehicle_simple: /(?:drive|car|vehicle|have a|own a|driving a|got a|second car|other car|also have|another car|my wife drives|husband drives|it's|its)\s+(?:a\s+)?([a-zA-Z0-9\s]+?)(?:\s(?:and|that|which|it)|$|\.|\,)/gi,

      // Direct vehicle mentions without trigger words
      vehicle_direct_year_make_model: /(?:^|\s)(\d{4})\s+([a-zA-Z]+)\s+([a-zA-Z]+)(?:\s|$|\.|\,)/gi,
      vehicle_direct_make_model: /(?:^|\s)([a-zA-Z]+)\s+([a-zA-Z]+)(?:\s|$|\.|\,)(?=.*(?:car|vehicle|drive|driving))/gi,

      // Very specific patterns for common responses
      vehicle_its_pattern: /(?:it's|its)\s+(?:a\s+)?(\d{4})\s+([a-zA-Z]+)\s+([a-zA-Z]+)/gi,
      vehicle_standalone_year_make_model: /(\d{4})\s+([a-zA-Z]+)\s+([a-zA-Z]+)/gi,
      vin: /(?:vin|vehicle identification|vin number)\s*(?:is\s*)?([a-zA-Z0-9]{17})/i,
      annual_mileage: /(?:drive|miles)\s+(?:about\s+)?(\d+(?:,\d{3})*)\s*(?:miles?\s*)?(?:per year|annually|a year)/i,

      // Vehicle Usage
      vehicle_use: /(?:use|drive)\s+(?:my car|vehicle|it)\s+(?:for\s+)?(?:mainly\s+)?(commuting|work|business|pleasure|personal)/i,
      parking: /(?:park|parked)\s+(?:in\s+)?(?:a\s+)?(garage|driveway|street|parking lot)/i,

      // Current Insurance
      current_insurer: /(?:currently with|insured with|have insurance with)\s+([a-zA-Z\s]+)/i,
      policy_expires: /(?:policy expires|expires on|renewal date)\s+([a-zA-Z0-9\/\-\s]+)/i,

      // Coverage Preferences
      coverage_type: /(?:need|want|looking for|interested in)\s+([^.!?]*(?:insurance|coverage|liability|comprehensive|collision)[^.!?]*)/i,
      deductible: /(?:deductible|deductible of)\s*(?:is\s*)?(\$?\d+)/i,

      // Driving History
      driving_years: /(?:driving for|been driving|driving experience|driving since)\s+(\d+)\s*(?:years?|yrs?)/i,
      accidents: /(?:had|been in)\s+(\d+)\s+(?:accident|crash|wreck|collision)s?\s*(?:in the past|in last)?\s*(\d+)?\s*(?:years?)?/i,
      tickets: /(?:got|received|had)\s+(\d+)\s+(?:ticket|violation|citation)s?\s*(?:in the past|in last)?\s*(\d+)?\s*(?:years?)?/i,
      claims: /(?:filed|made|had)\s+(\d+)\s+(?:claim|insurance claim)s?\s*(?:in the past|in last)?\s*(\d+)?\s*(?:years?)?/i,

      // Household Information
      household_drivers: /(?:household has|family has|there are)\s+(\d+)\s+(?:drivers?|people who drive)/i,
      spouse_name: /(?:spouse|husband|wife)\s+(?:is\s+)?([a-zA-Z\s]+)/i,

      // Financial Information
      credit_score: /(?:credit score|credit)\s*(?:is\s*)?(?:about\s+)?(\d{3})/i,
      homeowner: /(?:i\s+)?(own|rent)\s+(?:my\s+)?(?:home|house)/i
    };

    // Process all patterns
    Object.entries(patterns).forEach(([key, pattern]) => {
      // Handle global patterns (for vehicles) differently
      if (key.startsWith('vehicle_') && pattern.global) {
        // Use Array.from for better compatibility
        const matches = Array.from(allText.matchAll(pattern));
        matches.forEach((match, index) => {
          console.log(`Found match ${index + 1} for ${key}:`, match);
          handleVehicleMatch(key, match, data);
        });
      } else {
        const match = allText.match(pattern);
        if (match) {
          console.log(`Found match for ${key}:`, match);
          handleNonVehicleMatch(key, match, data);
        }
      }
    });

    // Helper function to handle vehicle matches
    function handleVehicleMatch(key: string, match: RegExpMatchArray, data: any) {
      switch (key) {
          // Vehicle Information - Support multiple vehicles
          case 'vehicle_year_make_model':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle1 = {
              id: data.extractedInfo.vehicles.length + 1,
              year: match[1],
              make: match[2],
              model: match[3],
              full: `${match[1]} ${match[2]} ${match[3]}`
            };
            // Check if this vehicle already exists
            const exists1 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle1.full);
            if (!exists1) {
              data.extractedInfo.vehicles.push(newVehicle1);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle1;
            }
            break;
          case 'vehicle_make_model':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle2 = {
              id: data.extractedInfo.vehicles.length + 1,
              make: match[1],
              model: match[2],
              full: `${match[1]} ${match[2]}`
            };
            // Check if this vehicle already exists
            const exists2 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle2.full);
            if (!exists2) {
              data.extractedInfo.vehicles.push(newVehicle2);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle2;
            }
            break;
          case 'vehicle_simple':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle3 = {
              id: data.extractedInfo.vehicles.length + 1,
              description: match[1].trim(),
              full: match[1].trim()
            };
            // Check if this vehicle already exists
            const exists3 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle3.full);
            if (!exists3) {
              data.extractedInfo.vehicles.push(newVehicle3);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle3;
            }
            break;
          case 'vehicle_direct_year_make_model':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle4 = {
              id: data.extractedInfo.vehicles.length + 1,
              year: match[1],
              make: match[2],
              model: match[3],
              full: `${match[1]} ${match[2]} ${match[3]}`
            };
            // Check if this vehicle already exists
            const exists4 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle4.full);
            if (!exists4) {
              data.extractedInfo.vehicles.push(newVehicle4);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle4;
            }
            break;
          case 'vehicle_direct_make_model':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle5 = {
              id: data.extractedInfo.vehicles.length + 1,
              make: match[1],
              model: match[2],
              full: `${match[1]} ${match[2]}`
            };
            // Check if this vehicle already exists
            const exists5 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle5.full);
            if (!exists5) {
              data.extractedInfo.vehicles.push(newVehicle5);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle5;
            }
            break;
          case 'vehicle_its_pattern':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle6 = {
              id: data.extractedInfo.vehicles.length + 1,
              year: match[1],
              make: match[2],
              model: match[3],
              full: `${match[1]} ${match[2]} ${match[3]}`
            };
            // Check if this vehicle already exists
            const exists6 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle6.full);
            if (!exists6) {
              data.extractedInfo.vehicles.push(newVehicle6);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle6;
            }
            break;
          case 'vehicle_standalone_year_make_model':
            data.extractedInfo.vehicles = data.extractedInfo.vehicles || [];
            const newVehicle7 = {
              id: data.extractedInfo.vehicles.length + 1,
              year: match[1],
              make: match[2],
              model: match[3],
              full: `${match[1]} ${match[2]} ${match[3]}`
            };
            // Check if this vehicle already exists
            const exists7 = data.extractedInfo.vehicles.some((v: any) => v.full === newVehicle7.full);
            if (!exists7) {
              data.extractedInfo.vehicles.push(newVehicle7);
            }
            // Also keep the single vehicle for backward compatibility
            if (!data.extractedInfo.vehicle) {
              data.extractedInfo.vehicle = newVehicle7;
            }
            break;
      }
    }

    // Helper function to handle non-vehicle matches
    function handleNonVehicleMatch(key: string, match: RegExpMatchArray, data: any) {
      switch (key) {
          // INSURANCE PURPOSE - HIGHEST PRIORITY
          case 'insurance_purpose_renewal':
            data.extractedInfo.insurancePurpose = data.extractedInfo.insurancePurpose || {};
            data.extractedInfo.insurancePurpose.type = 'renewal';
            data.extractedInfo.insurancePurpose.description = 'Customer wants to renew their current policy';
            data.extractedInfo.insurancePurpose.priority = 'HIGH';
            break;
          case 'insurance_purpose_new':
            data.extractedInfo.insurancePurpose = data.extractedInfo.insurancePurpose || {};
            data.extractedInfo.insurancePurpose.type = 'new_policy';
            data.extractedInfo.insurancePurpose.description = 'Customer needs a new insurance policy';
            data.extractedInfo.insurancePurpose.priority = 'HIGH';
            break;
          case 'insurance_purpose_adding_car':
            data.extractedInfo.insurancePurpose = data.extractedInfo.insurancePurpose || {};
            data.extractedInfo.insurancePurpose.type = 'adding_car';
            data.extractedInfo.insurancePurpose.description = 'Customer wants to add a car to existing policy';
            data.extractedInfo.insurancePurpose.priority = 'HIGH';
            break;
          case 'insurance_purpose_lowering_premium':
            data.extractedInfo.insurancePurpose = data.extractedInfo.insurancePurpose || {};
            data.extractedInfo.insurancePurpose.type = 'lowering_premium';
            data.extractedInfo.insurancePurpose.description = 'Customer wants to reduce their insurance costs';
            data.extractedInfo.insurancePurpose.priority = 'HIGH';
            break;
          case 'insurance_purpose_removing_car':
            data.extractedInfo.insurancePurpose = data.extractedInfo.insurancePurpose || {};
            data.extractedInfo.insurancePurpose.type = 'removing_car';
            data.extractedInfo.insurancePurpose.description = 'Customer wants to remove a car from policy';
            data.extractedInfo.insurancePurpose.priority = 'HIGH';
            break;

          // Personal Information
          case 'name':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.name = match[1].trim();
            break;
          case 'age':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.age = parseInt(match[1]);
            break;
          case 'birth_date':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.birthDate = match[1].trim();
            break;
          case 'email':
            data.extractedInfo.contactInfo = data.extractedInfo.contactInfo || {};
            data.extractedInfo.contactInfo.email = match[1];
            break;
          case 'phone':
            data.extractedInfo.contactInfo = data.extractedInfo.contactInfo || {};
            data.extractedInfo.contactInfo.phone = `${match[1]}-${match[2]}-${match[3]}`;
            break;
          case 'ssn':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.ssn = match[1];
            break;

          // Address Information
          case 'address':
            data.extractedInfo.address = data.extractedInfo.address || {};
            data.extractedInfo.address.street = match[1].trim();
            break;
          case 'city':
            data.extractedInfo.address = data.extractedInfo.address || {};
            data.extractedInfo.address.city = match[1].trim();
            break;
          case 'state':
            data.extractedInfo.address = data.extractedInfo.address || {};
            data.extractedInfo.address.state = match[1].trim();
            break;
          case 'zip_code':
            data.extractedInfo.address = data.extractedInfo.address || {};
            data.extractedInfo.address.zipCode = match[1];
            break;

          // Personal Details
          case 'marital_status':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.maritalStatus = match[1];
            break;
          case 'occupation':
            data.extractedInfo.personalInfo = data.extractedInfo.personalInfo || {};
            data.extractedInfo.personalInfo.occupation = match[1].trim();
            break;

          // Driver's License
          case 'license_number':
            data.extractedInfo.license = data.extractedInfo.license || {};
            data.extractedInfo.license.number = match[1];
            break;
          case 'license_state':
            data.extractedInfo.license = data.extractedInfo.license || {};
            data.extractedInfo.license.state = match[1].trim();
            break;

          // VIN and vehicle details (non-pattern based)
          case 'vin':
            data.extractedInfo.vehicle = data.extractedInfo.vehicle || {};
            data.extractedInfo.vehicle.vin = match[1];
            // Also add to the most recent vehicle in the array
            if (data.extractedInfo.vehicles && data.extractedInfo.vehicles.length > 0) {
              data.extractedInfo.vehicles[data.extractedInfo.vehicles.length - 1].vin = match[1];
            }
            break;
          case 'annual_mileage':
            data.extractedInfo.vehicle = data.extractedInfo.vehicle || {};
            data.extractedInfo.vehicle.annualMileage = parseInt(match[1].replace(/,/g, ''));
            // Also add to the most recent vehicle in the array
            if (data.extractedInfo.vehicles && data.extractedInfo.vehicles.length > 0) {
              data.extractedInfo.vehicles[data.extractedInfo.vehicles.length - 1].annualMileage = parseInt(match[1].replace(/,/g, ''));
            }
            break;

          // Vehicle Usage
          case 'vehicle_use':
            data.extractedInfo.vehicle = data.extractedInfo.vehicle || {};
            data.extractedInfo.vehicle.primaryUse = match[1];
            // Also add to the most recent vehicle in the array
            if (data.extractedInfo.vehicles && data.extractedInfo.vehicles.length > 0) {
              data.extractedInfo.vehicles[data.extractedInfo.vehicles.length - 1].primaryUse = match[1];
            }
            break;
          case 'parking':
            data.extractedInfo.vehicle = data.extractedInfo.vehicle || {};
            data.extractedInfo.vehicle.parking = match[1];
            // Also add to the most recent vehicle in the array
            if (data.extractedInfo.vehicles && data.extractedInfo.vehicles.length > 0) {
              data.extractedInfo.vehicles[data.extractedInfo.vehicles.length - 1].parking = match[1];
            }
            break;

          // Current Insurance
          case 'current_insurer':
            data.extractedInfo.currentInsurance = data.extractedInfo.currentInsurance || {};
            data.extractedInfo.currentInsurance.company = match[1].trim();
            break;
          case 'policy_expires':
            data.extractedInfo.currentInsurance = data.extractedInfo.currentInsurance || {};
            data.extractedInfo.currentInsurance.expirationDate = match[1].trim();
            break;

          // Coverage Preferences
          case 'coverage_type':
            data.extractedInfo.coverage = data.extractedInfo.coverage || {};
            data.extractedInfo.coverage.type = match[1].trim();
            break;
          case 'deductible':
            data.extractedInfo.coverage = data.extractedInfo.coverage || {};
            data.extractedInfo.coverage.deductible = match[1];
            break;

          // Driving History
          case 'driving_years':
            data.extractedInfo.drivingHistory = data.extractedInfo.drivingHistory || {};
            data.extractedInfo.drivingHistory.yearsExperience = parseInt(match[1]);
            break;
          case 'accidents':
            data.extractedInfo.drivingHistory = data.extractedInfo.drivingHistory || {};
            data.extractedInfo.drivingHistory.accidents = {
              count: parseInt(match[1]),
              timeframe: match[2] ? `${match[2]} years` : 'unspecified'
            };
            break;
          case 'tickets':
            data.extractedInfo.drivingHistory = data.extractedInfo.drivingHistory || {};
            data.extractedInfo.drivingHistory.tickets = {
              count: parseInt(match[1]),
              timeframe: match[2] ? `${match[2]} years` : 'unspecified'
            };
            break;
          case 'claims':
            data.extractedInfo.drivingHistory = data.extractedInfo.drivingHistory || {};
            data.extractedInfo.drivingHistory.claims = {
              count: parseInt(match[1]),
              timeframe: match[2] ? `${match[2]} years` : 'unspecified'
            };
            break;

          // Household Information
          case 'household_drivers':
            data.extractedInfo.household = data.extractedInfo.household || {};
            data.extractedInfo.household.totalDrivers = parseInt(match[1]);
            break;
          case 'spouse_name':
            data.extractedInfo.household = data.extractedInfo.household || {};
            data.extractedInfo.household.spouseName = match[1].trim();
            break;

          // Financial Information
          case 'credit_score':
            data.extractedInfo.financial = data.extractedInfo.financial || {};
            data.extractedInfo.financial.creditScore = parseInt(match[1]);
            break;
          case 'homeowner':
            data.extractedInfo.financial = data.extractedInfo.financial || {};
            data.extractedInfo.financial.homeOwnership = match[1];
            break;
        }
      }

    // Message statistics
    const userMessages = history.filter((item: any) => item.role === 'user').length;
    const assistantMessages = history.filter((item: any) => item.role === 'assistant').length;

    data.stats = {
      userMessages,
      assistantMessages,
      totalMessages: history.length
    };

    console.log('Extracted data:', data.extractedInfo);
    return data;
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

  // Update collected data when conversation changes
  useEffect(() => {
    const newData = extractDataFromConversation(conversationHistory);
    if (Object.keys(newData).length > 0) {
      newData.lastUpdated = new Date().toLocaleTimeString();
    }
    setCollectedData(newData);
  }, [conversationHistory]);



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
