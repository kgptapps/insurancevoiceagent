import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import sessionManager from '../services/sessionManager.js';

// Personal Information Collection Tool
export const collectPersonalInfoTool = tool({
  name: 'collect_personal_info',
  description: 'Collect and store personal information for insurance application',
  parameters: z.object({
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string()
    }).nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).nullable().optional(),
    occupation: z.string().nullable().optional(),
    previousInsurer: z.string().nullable().optional()
  }),
  execute: async (params, context) => {
    try {
      const sessionId = context?.context?.sessionId;
      if (!sessionId) {
        return 'Error: Session not found. Please start a new session.';
      }

      // Filter out undefined values
      const personalInfo = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      // Update session with personal information
      const updatedSession = sessionManager.updateSessionData(sessionId, {
        personalInfo: {
          ...sessionManager.getSession(sessionId)?.data?.personalInfo,
          ...personalInfo
        }
      });

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'system',
        `Personal information updated: ${Object.keys(personalInfo).join(', ')}`,
        { tool: 'collect_personal_info', data: personalInfo }
      );

      const completionStatus = updatedSession.data.completionStatus.personalInfo;
      
      return `Thank you! I've recorded your personal information. Your personal details are now ${completionStatus}% complete. ${
        completionStatus < 100 ? 'I may need a few more details as we continue.' : 'Your personal information section is complete!'
      }`;
    } catch (error) {
      console.error('Error in collect_personal_info:', error);
      return 'I apologize, but I had trouble saving that information. Could you please repeat it?';
    }
  }
});

// Vehicle Information Collection Tool
export const collectVehicleInfoTool = tool({
  name: 'collect_vehicle_info',
  description: 'Collect and store vehicle information for insurance application',
  parameters: z.object({
    make: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    vin: z.string().nullable().optional(),
    currentMileage: z.number().nullable().optional(),
    annualMileage: z.number().nullable().optional(),
    ownershipStatus: z.enum(['owned', 'leased', 'financed']).nullable().optional(),
    safetyFeatures: z.array(z.string()).nullable().optional(),
    modifications: z.array(z.string()).nullable().optional(),
    parkingLocation: z.enum(['garage', 'driveway', 'street', 'lot']).nullable().optional(),
    primaryUse: z.enum(['commuting', 'pleasure', 'business']).nullable().optional()
  }),
  execute: async (params, context) => {
    try {
      const sessionId = context?.context?.sessionId;
      if (!sessionId) {
        return 'Error: Session not found. Please start a new session.';
      }

      // Filter out undefined values
      const vehicleInfo = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      // Update session with vehicle information
      const updatedSession = sessionManager.updateSessionData(sessionId, {
        vehicleInfo: {
          ...sessionManager.getSession(sessionId)?.data?.vehicleInfo,
          ...vehicleInfo
        }
      });

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'system',
        `Vehicle information updated: ${Object.keys(vehicleInfo).join(', ')}`,
        { tool: 'collect_vehicle_info', data: vehicleInfo }
      );

      const completionStatus = updatedSession.data.completionStatus.vehicleInfo;
      
      return `Perfect! I've recorded your vehicle information. Your vehicle details are now ${completionStatus}% complete. ${
        completionStatus < 100 ? 'I may need a few more vehicle details.' : 'Your vehicle information section is complete!'
      }`;
    } catch (error) {
      console.error('Error in collect_vehicle_info:', error);
      return 'I apologize, but I had trouble saving that vehicle information. Could you please repeat it?';
    }
  }
});

// Coverage Preferences Collection Tool
export const collectCoveragePreferencesTool = tool({
  name: 'collect_coverage_preferences',
  description: 'Collect and store coverage preferences for insurance application',
  parameters: z.object({
    liabilityLimits: z.object({
      bodilyInjury: z.number().nullable().optional(),
      propertyDamage: z.number().nullable().optional()
    }).nullable().optional(),
    comprehensive: z.object({
      selected: z.boolean(),
      deductible: z.number().nullable().optional()
    }).nullable().optional(),
    collision: z.object({
      selected: z.boolean(),
      deductible: z.number().nullable().optional()
    }).nullable().optional(),
    additionalCoverage: z.object({
      rental: z.boolean().nullable().optional(),
      roadside: z.boolean().nullable().optional(),
      gapCoverage: z.boolean().nullable().optional()
    }).nullable().optional(),
    policyStartDate: z.string().nullable().optional()
  }),
  execute: async (params, context) => {
    try {
      const sessionId = context?.context?.sessionId;
      if (!sessionId) {
        return 'Error: Session not found. Please start a new session.';
      }

      // Filter out undefined values
      const coveragePrefs = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      // Update session with coverage preferences
      const updatedSession = sessionManager.updateSessionData(sessionId, {
        coveragePrefs: {
          ...sessionManager.getSession(sessionId)?.data?.coveragePrefs,
          ...coveragePrefs
        }
      });

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'system',
        `Coverage preferences updated: ${Object.keys(coveragePrefs).join(', ')}`,
        { tool: 'collect_coverage_preferences', data: coveragePrefs }
      );

      const completionStatus = updatedSession.data.completionStatus.coveragePrefs;
      
      return `Excellent! I've recorded your coverage preferences. Your coverage selection is now ${completionStatus}% complete. ${
        completionStatus < 100 ? 'We may need to discuss a few more coverage options.' : 'Your coverage preferences are all set!'
      }`;
    } catch (error) {
      console.error('Error in collect_coverage_preferences:', error);
      return 'I apologize, but I had trouble saving those coverage preferences. Could you please repeat them?';
    }
  }
});

// Driving History Collection Tool
export const collectDrivingHistoryTool = tool({
  name: 'collect_driving_history',
  description: 'Collect and store driving history information for insurance application',
  parameters: z.object({
    licenseNumber: z.string().nullable().optional(),
    licenseState: z.string().nullable().optional(),
    yearsLicensed: z.number().nullable().optional(),
    accidents: z.array(z.object({
      date: z.string(),
      description: z.string(),
      atFault: z.boolean()
    })).nullable().optional(),
    violations: z.array(z.object({
      date: z.string(),
      type: z.string(),
      description: z.string()
    })).nullable().optional(),
    claims: z.array(z.object({
      date: z.string(),
      type: z.string(),
      amount: z.number()
    })).nullable().optional(),
    defensiveDriving: z.boolean().nullable().optional()
  }),
  execute: async (params, context) => {
    try {
      const sessionId = context?.context?.sessionId;
      if (!sessionId) {
        return 'Error: Session not found. Please start a new session.';
      }

      // Filter out undefined values
      const drivingHistory = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      // Update session with driving history
      const updatedSession = sessionManager.updateSessionData(sessionId, {
        drivingHistory: {
          ...sessionManager.getSession(sessionId)?.data?.drivingHistory,
          ...drivingHistory
        }
      });

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'system',
        `Driving history updated: ${Object.keys(drivingHistory).join(', ')}`,
        { tool: 'collect_driving_history', data: drivingHistory }
      );

      const completionStatus = updatedSession.data.completionStatus.drivingHistory;
      
      return `Thank you! I've recorded your driving history. Your driving record information is now ${completionStatus}% complete. ${
        completionStatus < 100 ? 'I may need a few more details about your driving history.' : 'Your driving history section is complete!'
      }`;
    } catch (error) {
      console.error('Error in collect_driving_history:', error);
      return 'I apologize, but I had trouble saving that driving history information. Could you please repeat it?';
    }
  }
});

// Summary and Validation Tool
export const validateAndSummarizeTool = tool({
  name: 'validate_and_summarize',
  description: 'Validate collected information and provide a summary of the insurance application',
  parameters: z.object({
    requestSummary: z.boolean().default(true)
  }),
  execute: async (params, context) => {
    try {
      const sessionId = context?.context?.sessionId;
      if (!sessionId) {
        return 'Error: Session not found. Please start a new session.';
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return 'Error: Session not found. Please start a new session.';
      }

      const { data } = session;
      const { completionStatus } = data;

      // Create summary
      let summary = "Here's a summary of your insurance application:\n\n";
      
      // Personal Information Summary
      summary += `**Personal Information (${completionStatus.personalInfo}% complete):**\n`;
      if (data.personalInfo.firstName && data.personalInfo.lastName) {
        summary += `- Name: ${data.personalInfo.firstName} ${data.personalInfo.lastName}\n`;
      }
      if (data.personalInfo.dateOfBirth) {
        summary += `- Date of Birth: ${data.personalInfo.dateOfBirth}\n`;
      }
      if (data.personalInfo.address) {
        summary += `- Address: ${data.personalInfo.address.street}, ${data.personalInfo.address.city}, ${data.personalInfo.address.state} ${data.personalInfo.address.zipCode}\n`;
      }
      if (data.personalInfo.phone) {
        summary += `- Phone: ${data.personalInfo.phone}\n`;
      }
      if (data.personalInfo.email) {
        summary += `- Email: ${data.personalInfo.email}\n`;
      }

      // Vehicle Information Summary
      summary += `\n**Vehicle Information (${completionStatus.vehicleInfo}% complete):**\n`;
      if (data.vehicleInfo.year && data.vehicleInfo.make && data.vehicleInfo.model) {
        summary += `- Vehicle: ${data.vehicleInfo.year} ${data.vehicleInfo.make} ${data.vehicleInfo.model}\n`;
      }
      if (data.vehicleInfo.vin) {
        summary += `- VIN: ${data.vehicleInfo.vin}\n`;
      }
      if (data.vehicleInfo.currentMileage) {
        summary += `- Current Mileage: ${data.vehicleInfo.currentMileage.toLocaleString()}\n`;
      }
      if (data.vehicleInfo.annualMileage) {
        summary += `- Annual Mileage: ${data.vehicleInfo.annualMileage.toLocaleString()}\n`;
      }

      // Coverage Preferences Summary
      summary += `\n**Coverage Preferences (${completionStatus.coveragePrefs}% complete):**\n`;
      if (data.coveragePrefs.liabilityLimits) {
        summary += `- Liability Limits: $${data.coveragePrefs.liabilityLimits.bodilyInjury?.toLocaleString() || 'TBD'} / $${data.coveragePrefs.liabilityLimits.propertyDamage?.toLocaleString() || 'TBD'}\n`;
      }
      if (data.coveragePrefs.comprehensive?.selected) {
        summary += `- Comprehensive: Yes (Deductible: $${data.coveragePrefs.comprehensive.deductible || 'TBD'})\n`;
      }
      if (data.coveragePrefs.collision?.selected) {
        summary += `- Collision: Yes (Deductible: $${data.coveragePrefs.collision.deductible || 'TBD'})\n`;
      }

      // Driving History Summary
      summary += `\n**Driving History (${completionStatus.drivingHistory}% complete):**\n`;
      if (data.drivingHistory.yearsLicensed) {
        summary += `- Years Licensed: ${data.drivingHistory.yearsLicensed}\n`;
      }
      if (data.drivingHistory.accidents?.length > 0) {
        summary += `- Accidents: ${data.drivingHistory.accidents.length}\n`;
      }
      if (data.drivingHistory.violations?.length > 0) {
        summary += `- Violations: ${data.drivingHistory.violations.length}\n`;
      }

      summary += `\n**Overall Completion: ${completionStatus.overall}%**\n`;

      if (completionStatus.overall < 100) {
        summary += "\nWe still need to collect some additional information to complete your application.";
      } else {
        summary += "\nYour application is complete! We have all the information needed to provide you with a quote.";
      }

      // Add to conversation history
      sessionManager.addConversationItem(
        sessionId,
        'system',
        'Application summary generated',
        { tool: 'validate_and_summarize', completionStatus }
      );

      return summary;
    } catch (error) {
      console.error('Error in validate_and_summarize:', error);
      return 'I apologize, but I had trouble generating the summary. Let me try to continue with your application.';
    }
  }
});
