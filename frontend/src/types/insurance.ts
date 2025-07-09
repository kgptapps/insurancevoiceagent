// Insurance application types
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface PersonalInfo {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  address?: Address;
  phone?: string;
  email?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  occupation?: string;
  previousInsurer?: string;
}

export interface VehicleInfo {
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  currentMileage?: number;
  annualMileage?: number;
  ownershipStatus?: 'owned' | 'leased' | 'financed';
  safetyFeatures?: string[];
  modifications?: string[];
  parkingLocation?: 'garage' | 'driveway' | 'street' | 'lot';
  primaryUse?: 'commuting' | 'pleasure' | 'business';
}

export interface CoveragePrefs {
  liabilityLimits?: {
    bodilyInjury?: number;
    propertyDamage?: number;
  };
  comprehensive?: {
    selected: boolean;
    deductible?: number;
  };
  collision?: {
    selected: boolean;
    deductible?: number;
  };
  additionalCoverage?: {
    rental?: boolean;
    roadside?: boolean;
    gapCoverage?: boolean;
  };
  policyStartDate?: string;
}

export interface DrivingHistory {
  licenseNumber?: string;
  licenseState?: string;
  yearsLicensed?: number;
  accidents?: Array<{
    date: string;
    description: string;
    atFault: boolean;
  }>;
  violations?: Array<{
    date: string;
    type: string;
    description: string;
  }>;
  claims?: Array<{
    date: string;
    type: string;
    amount: number;
  }>;
  defensiveDriving?: boolean;
}

export interface CompletionStatus {
  personalInfo: number;
  vehicleInfo: number;
  coveragePrefs: number;
  drivingHistory: number;
  overall: number;
}

export interface InsuranceApplication {
  sessionId: string;
  personalInfo: PersonalInfo;
  vehicleInfo: VehicleInfo;
  coveragePrefs: CoveragePrefs;
  drivingHistory: DrivingHistory;
  completionStatus: CompletionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationItem {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface VoiceSession {
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

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  payload: any;
}

export interface SessionStartMessage extends WebSocketMessage {
  type: 'session:start';
  payload: {
    sessionId?: string;
    config?: any;
  };
}

export interface AudioInputMessage extends WebSocketMessage {
  type: 'audio:input';
  payload: {
    sessionId: string;
    audioData: number[];
    format: string;
  };
}

export interface TextInputMessage extends WebSocketMessage {
  type: 'text:input';
  payload: {
    sessionId: string;
    message: string;
  };
}

export interface SessionStatusMessage extends WebSocketMessage {
  type: 'session:status';
  payload: {
    sessionId: string;
    status: string;
    message?: string;
  };
}

export interface AudioOutputMessage extends WebSocketMessage {
  type: 'audio:output';
  payload: {
    sessionId: string;
    audioData: number[];
    format: string;
  };
}

export interface DataUpdatedMessage extends WebSocketMessage {
  type: 'data:updated';
  payload: {
    sessionId: string;
    data: InsuranceApplication;
    completionStatus: CompletionStatus;
  };
}

export interface AgentResponseMessage extends WebSocketMessage {
  type: 'agent:response';
  payload: {
    sessionId: string;
    message: string;
    type: 'question' | 'confirmation' | 'error' | 'completion';
  };
}

export interface UserTranscriptMessage extends WebSocketMessage {
  type: 'user:transcript';
  payload: {
    sessionId: string;
    transcript: string;
  };
}
