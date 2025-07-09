import { z } from 'zod';

// Address schema
export const AddressSchema = z.object({
  street: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required').max(2, 'State must be 2 characters'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format')
});

// Personal Information schema
export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  dateOfBirth: z.string().optional(), // Will be parsed as date
  address: AddressSchema.optional(),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format').optional(),
  email: z.string().email('Invalid email format').optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  occupation: z.string().optional(),
  previousInsurer: z.string().optional()
});

// Vehicle Information schema
export const VehicleInfoSchema = z.object({
  make: z.string().min(1, 'Vehicle make is required').optional(),
  model: z.string().min(1, 'Vehicle model is required').optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 1).optional(),
  vin: z.string().length(17, 'VIN must be 17 characters').optional(),
  currentMileage: z.number().min(0).optional(),
  annualMileage: z.number().min(0).max(100000).optional(),
  ownershipStatus: z.enum(['owned', 'leased', 'financed']).optional(),
  safetyFeatures: z.array(z.string()).default([]),
  modifications: z.array(z.string()).default([]),
  parkingLocation: z.enum(['garage', 'driveway', 'street', 'lot']).optional(),
  primaryUse: z.enum(['commuting', 'pleasure', 'business']).optional()
});

// Coverage Preferences schema
export const CoveragePrefsSchema = z.object({
  liabilityLimits: z.object({
    bodilyInjury: z.number().min(25000).optional(),
    propertyDamage: z.number().min(10000).optional()
  }).optional(),
  comprehensive: z.object({
    selected: z.boolean().default(false),
    deductible: z.number().optional()
  }).optional(),
  collision: z.object({
    selected: z.boolean().default(false),
    deductible: z.number().optional()
  }).optional(),
  additionalCoverage: z.object({
    rental: z.boolean().default(false),
    roadside: z.boolean().default(false),
    gapCoverage: z.boolean().default(false)
  }).optional(),
  policyStartDate: z.string().optional() // Will be parsed as date
});

// Driving History schema
export const DrivingHistorySchema = z.object({
  licenseNumber: z.string().optional(),
  licenseState: z.string().min(2).max(2).optional(),
  yearsLicensed: z.number().min(0).max(80).optional(),
  accidents: z.array(z.object({
    date: z.string(),
    description: z.string(),
    atFault: z.boolean()
  })).default([]),
  violations: z.array(z.object({
    date: z.string(),
    type: z.string(),
    description: z.string()
  })).default([]),
  claims: z.array(z.object({
    date: z.string(),
    type: z.string(),
    amount: z.number()
  })).default([]),
  defensiveDriving: z.boolean().default(false)
});

// Complete Insurance Application schema
export const InsuranceApplicationSchema = z.object({
  sessionId: z.string(),
  personalInfo: PersonalInfoSchema.default({}),
  vehicleInfo: VehicleInfoSchema.default({}),
  coveragePrefs: CoveragePrefsSchema.default({}),
  drivingHistory: DrivingHistorySchema.default({}),
  completionStatus: z.object({
    personalInfo: z.number().min(0).max(100).default(0),
    vehicleInfo: z.number().min(0).max(100).default(0),
    coveragePrefs: z.number().min(0).max(100).default(0),
    drivingHistory: z.number().min(0).max(100).default(0),
    overall: z.number().min(0).max(100).default(0)
  }).default({}),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

// Session schema
export const VoiceSessionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  agentId: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'error']).default('active'),
  data: InsuranceApplicationSchema,
  conversationHistory: z.array(z.object({
    id: z.string(),
    type: z.enum(['user', 'agent', 'system']),
    content: z.string(),
    timestamp: z.date().default(() => new Date()),
    metadata: z.record(z.any()).optional()
  })).default([]),
  createdAt: z.date().default(() => new Date()),
  lastActivity: z.date().default(() => new Date()),
  expiresAt: z.date()
});

// Export types for use in other files
export const createEmptyApplication = (sessionId) => ({
  sessionId,
  personalInfo: {},
  vehicleInfo: {},
  coveragePrefs: {},
  drivingHistory: {},
  completionStatus: {
    personalInfo: 0,
    vehicleInfo: 0,
    coveragePrefs: 0,
    drivingHistory: 0,
    overall: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
});
