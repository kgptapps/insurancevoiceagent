# Auto Insurance Voice Agent - Technical Specifications

## 🏗️ System Architecture

### High-Level Architecture
```
┌─────────────────┐    WebSocket    ┌──────────────────┐    HTTPS    ┌─────────────────┐
│   React Client  │ ←──────────────→ │  Next.js Backend │ ───────────→ │  OpenAI API     │
│                 │                  │                  │              │                 │
│ - Voice Controls│                  │ - RealtimeAgent  │              │ - Realtime API  │
│ - Form Display  │                  │ - Session Mgmt   │              │ - Voice Models  │
│ - Audio Handling│                  │ - Data Storage   │              │                 │
└─────────────────┘                  └──────────────────┘              └─────────────────┘
```

### Component Breakdown

#### Frontend (React + TypeScript)
- **Voice Interface**: Microphone access, audio playback, voice controls
- **Form Display**: Real-time updates, progress tracking, validation feedback
- **WebSocket Client**: Bidirectional communication with backend
- **State Management**: Session state, form data, UI state

#### Backend (Next.js + OpenAI Agents SDK)
- **API Routes**: Session management, health checks, configuration
- **WebSocket Server**: Real-time audio streaming and communication
- **RealtimeAgent**: OpenAI voice agent with insurance specialization
- **Data Layer**: Session storage, validation, persistence

#### External Services
- **OpenAI Realtime API**: Voice processing and AI responses
- **Browser APIs**: Web Audio API, WebRTC for audio handling

---

## 📊 Data Models

### Insurance Form Schema
```typescript
interface InsuranceApplication {
  sessionId: string;
  personalInfo: PersonalInformation;
  vehicleInfo: VehicleInformation;
  coveragePrefs: CoveragePreferences;
  drivingHistory: DrivingHistory;
  completionStatus: CompletionStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonalInformation {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  ssn?: string; // Last 4 digits only
  address: Address;
  phone: string;
  email: string;
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed';
  occupation: string;
  previousInsurer?: string;
}

interface VehicleInformation {
  make: string;
  model: string;
  year: number;
  vin: string;
  currentMileage: number;
  annualMileage: number;
  ownershipStatus: 'owned' | 'leased' | 'financed';
  safetyFeatures: string[];
  modifications: string[];
  parkingLocation: 'garage' | 'driveway' | 'street' | 'lot';
  primaryUse: 'commuting' | 'pleasure' | 'business';
}

interface CoveragePreferences {
  liabilityLimits: {
    bodilyInjury: number;
    propertyDamage: number;
  };
  comprehensive: {
    selected: boolean;
    deductible?: number;
  };
  collision: {
    selected: boolean;
    deductible?: number;
  };
  additionalCoverage: {
    rental: boolean;
    roadside: boolean;
    gapCoverage: boolean;
  };
  policyStartDate: Date;
}

interface DrivingHistory {
  licenseNumber: string;
  licenseState: string;
  yearsLicensed: number;
  accidents: Accident[];
  violations: Violation[];
  claims: Claim[];
  defensiveDriving: boolean;
}
```

### Session Management
```typescript
interface VoiceSession {
  id: string;
  userId?: string;
  agentId: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  data: InsuranceApplication;
  conversationHistory: ConversationItem[];
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

interface ConversationItem {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  audioData?: ArrayBuffer;
  metadata?: Record<string, any>;
}
```

---

## 🔧 API Specifications

### WebSocket Events

#### Client → Server
```typescript
// Start voice session
{
  type: 'session:start',
  payload: {
    sessionId?: string,
    config?: SessionConfig
  }
}

// Send audio data
{
  type: 'audio:input',
  payload: {
    sessionId: string,
    audioData: ArrayBuffer,
    format: 'pcm16' | 'g711_ulaw' | 'g711_alaw'
  }
}

// Send text input
{
  type: 'text:input',
  payload: {
    sessionId: string,
    message: string
  }
}

// Update session data
{
  type: 'data:update',
  payload: {
    sessionId: string,
    field: string,
    value: any
  }
}
```

#### Server → Client
```typescript
// Session status updates
{
  type: 'session:status',
  payload: {
    sessionId: string,
    status: 'connected' | 'processing' | 'error',
    message?: string
  }
}

// Audio output
{
  type: 'audio:output',
  payload: {
    sessionId: string,
    audioData: ArrayBuffer,
    format: string
  }
}

// Form data updates
{
  type: 'data:updated',
  payload: {
    sessionId: string,
    data: Partial<InsuranceApplication>,
    completionStatus: CompletionStatus
  }
}

// Agent responses
{
  type: 'agent:response',
  payload: {
    sessionId: string,
    message: string,
    type: 'question' | 'confirmation' | 'error' | 'completion'
  }
}
```

### REST API Endpoints

#### Session Management
```typescript
// Create new session
POST /api/sessions
Response: { sessionId: string, status: string }

// Get session data
GET /api/sessions/:sessionId
Response: { session: VoiceSession }

// Update session data
PATCH /api/sessions/:sessionId
Body: { data: Partial<InsuranceApplication> }
Response: { success: boolean, data: InsuranceApplication }

// Delete session
DELETE /api/sessions/:sessionId
Response: { success: boolean }
```

#### Health & Configuration
```typescript
// Health check
GET /api/health
Response: { status: 'ok', timestamp: string }

// Get agent configuration
GET /api/config
Response: { agentConfig: AgentConfiguration }
```

---

## 🎙️ Voice Agent Configuration

### RealtimeAgent Setup
```typescript
const insuranceAgent = new RealtimeAgent({
  name: 'Insurance Specialist',
  instructions: `
    You are a professional auto insurance specialist helping customers complete their insurance application.
    
    Your goals:
    1. Collect all required information systematically
    2. Provide helpful explanations when needed
    3. Validate information in real-time
    4. Guide users through the process efficiently
    5. Maintain a professional, friendly tone
    
    Information to collect:
    - Personal details (name, address, contact info)
    - Vehicle information (make, model, year, VIN, etc.)
    - Coverage preferences (liability limits, deductibles)
    - Driving history (accidents, violations, claims)
    
    Always confirm important details and provide summaries at key points.
  `,
  model: 'gpt-4o-realtime-preview-2025-06-03',
  tools: [
    collectPersonalInfoTool,
    collectVehicleInfoTool,
    collectCoveragePreferencesTool,
    collectDrivingHistoryTool,
    validateAndSummarizeTool
  ],
  outputGuardrails: [
    noPersonalDataLeakGuardrail,
    professionalToneGuardrail
  ]
});
```

### Function Tools
```typescript
const collectPersonalInfoTool = tool({
  name: 'collect_personal_info',
  description: 'Collect and store personal information',
  parameters: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string()
    }).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional()
  }),
  execute: async (params, context) => {
    // Store collected information in session
    // Validate data format
    // Return confirmation message
  }
});
```

---

## 🔒 Security Considerations

### API Security
- **Environment Variables**: OpenAI API keys stored server-side only
- **Session Isolation**: Each user session completely isolated
- **Data Sanitization**: All inputs validated and sanitized
- **Rate Limiting**: Prevent abuse of voice API endpoints

### Data Privacy
- **Temporary Storage**: Session data automatically expires
- **No Persistent Storage**: Sensitive data not permanently stored
- **Encryption**: All WebSocket communication encrypted
- **Minimal Data**: Only collect necessary insurance information

### Error Handling
- **Graceful Degradation**: Fallback to text input if voice fails
- **Connection Recovery**: Automatic reconnection with session restoration
- **Input Validation**: Comprehensive validation at all layers
- **Error Logging**: Secure logging without sensitive data

---

## 📱 Browser Compatibility

### Supported Browsers
- **Chrome**: 88+ (recommended)
- **Firefox**: 85+
- **Safari**: 14+
- **Edge**: 88+

### Required Features
- **WebRTC**: For audio handling
- **WebSocket**: For real-time communication
- **Web Audio API**: For microphone access
- **ES2020**: Modern JavaScript features

### Fallback Options
- **Text Input**: If microphone access denied
- **Simplified UI**: For older browsers
- **Progressive Enhancement**: Core functionality works everywhere

---

## 🚀 Deployment Configuration

### Environment Variables
```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-realtime-preview-2025-06-03

# Application Configuration
NEXT_PUBLIC_WS_URL=ws://localhost:3001
SESSION_TIMEOUT=1800000  # 30 minutes
MAX_CONCURRENT_SESSIONS=50

# Development
NODE_ENV=development
DEBUG=voice-agent:*
```

### Performance Targets
- **Response Time**: <2 seconds for voice responses
- **Concurrent Users**: 50+ simultaneous sessions
- **Memory Usage**: <100MB per session
- **Audio Quality**: 16kHz PCM, low latency

---

**Document Version**: 1.0  
**Last Updated**: 2025-07-09  
**Next Review**: After implementation begins
