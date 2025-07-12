import {
  validateZipCode,
  validateVehicleYear,
  getValidVehicleMakes,
  validateVehicleMake,
  getValidVehicleModels,
  validateVehicleModel,
  getValidVehicleTrims
} from './validationTools.js';

/**
 * Tool to ask about customer's insurance needs
 */
export const askInsuranceNeedsTool = {
  name: 'ask_insurance_needs',
  description: 'Ask customer about their specific auto insurance needs (new, renewal, adding/removing car, lowering premium)',
  parameters: {
    type: 'object',
    properties: {
      needType: {
        type: 'string',
        description: 'Type of insurance need: new, renewal, adding_car, removing_car, lowering_premium, or other'
      },
      currentInsurer: {
        type: 'string',
        description: 'Current insurance company name (e.g., State Farm, Geico, Progressive, Allstate, USAA, Farmers, etc.)'
      },
      currentPremium: {
        type: 'string',
        description: 'Current monthly or annual premium amount (if known)'
      },
      monthsWithInsurer: {
        type: 'number',
        description: 'How many months customer has been with current insurer'
      },
      hasContinuousCoverage: {
        type: 'boolean',
        description: 'Whether customer has had continuous auto insurance coverage for past 30 days'
      },
      reasonForShopping: {
        type: 'string',
        description: 'Why customer is shopping for new insurance (e.g., renewal, high rates, poor service, moving, etc.)'
      }
    },
    required: ['needType']
  },
  execute: async ({ needType, currentInsurer, currentPremium, monthsWithInsurer, hasContinuousCoverage, reasonForShopping }) => {
    console.log(`🎯 Customer insurance need: ${needType}`);
    if (currentInsurer) console.log(`🏢 Current insurer: ${currentInsurer}`);
    if (currentPremium) console.log(`💰 Current premium: ${currentPremium}`);
    if (monthsWithInsurer) console.log(`📅 Months with insurer: ${monthsWithInsurer}`);
    if (hasContinuousCoverage !== undefined) console.log(`📋 Continuous coverage: ${hasContinuousCoverage ? 'Yes' : 'No'}`);
    if (reasonForShopping) console.log(`🔍 Reason for shopping: ${reasonForShopping}`);

    const needMessages = {
      new: "Perfect! Getting your first auto insurance policy? I'll find you the best rates to start with!",
      renewal: currentInsurer ?
        `Great! Renewal time with ${currentInsurer} is the perfect opportunity to save money. Most customers save $200-800 when they switch!` :
        "Great! Renewal time is the perfect opportunity to save money. Most customers save $200-800 when they renew with us!",
      adding_car: "Adding a vehicle? This is a great time to review your rates and potentially save on your entire policy!",
      removing_car: "Removing a vehicle should definitely lower your premium. Let me make sure you're getting the best rates!",
      lowering_premium: currentPremium ?
        `You came to the right place! Currently paying ${currentPremium}? I specialize in finding lower rates - let's see how much we can save you!` :
        "You came to the right place! I specialize in finding lower rates. Let's see how much we can save you!",
      other: "I'd love to help with your auto insurance needs. Let me find you the most competitive rates!"
    };

    // Store in global session data for later use
    if (!global.sessionData) global.sessionData = {};
    global.sessionData.needType = needType;
    if (currentInsurer) global.sessionData.currentInsurer = currentInsurer;
    if (currentPremium) global.sessionData.currentPremium = currentPremium;
    if (monthsWithInsurer) global.sessionData.monthsWithInsurer = monthsWithInsurer;
    if (hasContinuousCoverage !== undefined) global.sessionData.hasContinuousCoverage = hasContinuousCoverage;
    if (reasonForShopping) global.sessionData.reasonForShopping = reasonForShopping;

    return {
      success: true,
      needType,
      currentInsurer,
      currentPremium,
      monthsWithInsurer,
      hasContinuousCoverage,
      reasonForShopping,
      message: needMessages[needType] || needMessages.other,
      nextStep: currentInsurer ?
        `Now let me get some information to find you better rates than ${currentInsurer}...` :
        "Now let me get some information to find you the best rates..."
    };
  }
};

/**
 * Tool to validate zip code using QuoteWizard API
 */
export const validateZipCodeTool = {
  name: 'validate_zipcode',
  description: 'Validate a zip code to ensure it is serviceable for insurance quotes',
  parameters: {
    type: 'object',
    properties: {
      zipcode: {
        type: 'string',
        description: 'The zip code to validate (5 or 9 digits)'
      }
    },
    required: ['zipcode']
  },
  execute: async ({ zipcode }) => {
    const result = await validateZipCode(zipcode);
    return {
      success: result.valid,
      ...result
    };
  }
};

/**
 * Tool to get available vehicle makes for a specific year
 */
export const getVehicleMakesTool = {
  name: 'get_vehicle_makes',
  description: 'Get available vehicle makes for a specific year to help customer choose their vehicle make',
  parameters: {
    type: 'object',
    properties: {
      year: {
        type: 'string',
        description: 'The vehicle year (1987 to current year + 1)'
      }
    },
    required: ['year']
  },
  execute: async ({ year }) => {
    const result = await getValidVehicleMakes(year);
    return {
      success: result.valid,
      ...result
    };
  }
};

/**
 * Tool to collect and validate vehicle year (Step 1)
 */
export const collectVehicleYearTool = {
  name: 'collect_vehicle_year',
  description: 'Collect and validate vehicle year (1987 or newer)',
  parameters: {
    type: 'object',
    properties: {
      vehicleNumber: {
        type: 'number',
        description: 'Vehicle number (1 or 2)'
      },
      year: {
        type: 'string',
        description: 'Vehicle year (e.g., 2020, 2015)'
      }
    },
    required: ['vehicleNumber', 'year']
  },
  execute: async ({ vehicleNumber, year }) => {
    try {
      console.log(`🚗 Collecting vehicle ${vehicleNumber} year: ${year}`);

      // Validate vehicle number
      if (vehicleNumber < 1 || vehicleNumber > 2) {
        return {
          success: false,
          error: 'Vehicle number must be 1 or 2'
        };
      }

      // Validate the year
      const yearValidation = validateVehicleYear(year);
      if (!yearValidation.valid) {
        return {
          success: false,
          error: yearValidation.error,
          nextStep: 'Please provide a valid year between 1987 and current year.'
        };
      }

      // Store in session data
      if (!global.sessionData) global.sessionData = {};
      if (!global.sessionData.vehicles) global.sessionData.vehicles = [];

      // Initialize or update vehicle object
      const vehicleIndex = vehicleNumber - 1;
      if (!global.sessionData.vehicles[vehicleIndex]) {
        global.sessionData.vehicles[vehicleIndex] = {};
      }
      global.sessionData.vehicles[vehicleIndex].year = parseInt(yearValidation.year);
      global.sessionData.vehicles[vehicleIndex].vehicleNumber = vehicleNumber;

      console.log(`✅ Vehicle ${vehicleNumber} year validated: ${yearValidation.year}`);

      return {
        success: true,
        year: parseInt(yearValidation.year),
        message: `Great! ${yearValidation.year} is a valid year. Now, what's the make of your ${yearValidation.year} vehicle? Like Toyota, Ford, Honda, Chevrolet?`,
        nextStep: 'collect_vehicle_make'
      };

    } catch (error) {
      console.error('Error collecting vehicle year:', error);
      return {
        success: false,
        error: 'Unable to validate vehicle year at this time'
      };
    }
  }
};

/**
 * Tool to collect and validate vehicle make (Step 2)
 */
export const collectVehicleMakeTool = {
  name: 'collect_vehicle_make',
  description: 'Collect and validate vehicle make for the specified year',
  parameters: {
    type: 'object',
    properties: {
      vehicleNumber: {
        type: 'number',
        description: 'Vehicle number (1 or 2)'
      },
      make: {
        type: 'string',
        description: 'Vehicle make (e.g., Toyota, Ford, Honda)'
      }
    },
    required: ['vehicleNumber', 'make']
  },
  execute: async ({ vehicleNumber, make }) => {
    try {
      console.log(`🏭 Collecting vehicle ${vehicleNumber} make: ${make}`);

      // Get the year from session data
      const sessionData = global.sessionData || {};
      const vehicles = sessionData.vehicles || [];
      const vehicle = vehicles[vehicleNumber - 1];

      if (!vehicle || !vehicle.year) {
        return {
          success: false,
          error: 'Please provide the vehicle year first.',
          nextStep: 'collect_vehicle_year'
        };
      }

      // Validate the make for this year
      const makeValidation = await validateVehicleMake(vehicle.year.toString(), make);
      if (!makeValidation.valid) {
        return {
          success: false,
          error: makeValidation.error,
          availableMakes: makeValidation.availableMakes?.slice(0, 10), // Show first 10 makes
          nextStep: 'Please choose from the available makes listed.'
        };
      }

      // Store in session data
      global.sessionData.vehicles[vehicleNumber - 1].make = makeValidation.make;

      console.log(`✅ Vehicle ${vehicleNumber} make validated: ${makeValidation.make}`);

      return {
        success: true,
        year: vehicle.year,
        make: makeValidation.make,
        message: `Perfect! ${vehicle.year} ${makeValidation.make}. Now what's the model? Like Camry, F-150, Civic?`,
        nextStep: 'collect_vehicle_model'
      };

    } catch (error) {
      console.error('Error collecting vehicle make:', error);
      return {
        success: false,
        error: 'Unable to validate vehicle make at this time'
      };
    }
  }
};

/**
 * Tool to collect and validate vehicle model (Step 3)
 */
export const collectVehicleModelTool = {
  name: 'collect_vehicle_model',
  description: 'Collect and validate vehicle model for the specified year and make',
  parameters: {
    type: 'object',
    properties: {
      vehicleNumber: {
        type: 'number',
        description: 'Vehicle number (1 or 2)'
      },
      model: {
        type: 'string',
        description: 'Vehicle model (e.g., Camry, F-150, Civic)'
      }
    },
    required: ['vehicleNumber', 'model']
  },
  execute: async ({ vehicleNumber, model }) => {
    try {
      console.log(`🚙 Collecting vehicle ${vehicleNumber} model: ${model}`);

      // Get the year and make from session data
      const sessionData = global.sessionData || {};
      const vehicles = sessionData.vehicles || [];
      const vehicle = vehicles[vehicleNumber - 1];

      if (!vehicle || !vehicle.year || !vehicle.make) {
        return {
          success: false,
          error: 'Please provide the vehicle year and make first.',
          nextStep: 'collect_vehicle_year'
        };
      }

      // Validate the model for this year and make
      const modelValidation = await validateVehicleModel(vehicle.year.toString(), vehicle.make, model);
      if (!modelValidation.valid) {
        return {
          success: false,
          error: modelValidation.error,
          availableModels: modelValidation.availableModels?.slice(0, 10), // Show first 10 models
          nextStep: 'Please choose from the available models listed.'
        };
      }

      // Store in session data
      global.sessionData.vehicles[vehicleNumber - 1].model = modelValidation.model;

      console.log(`✅ Vehicle ${vehicleNumber} model validated: ${modelValidation.model}`);

      return {
        success: true,
        year: vehicle.year,
        make: vehicle.make,
        model: modelValidation.model,
        message: `Excellent! ${vehicle.year} ${vehicle.make} ${modelValidation.model}. Now let me get the trim level for the most accurate quote.`,
        nextStep: 'collect_vehicle_trim'
      };

    } catch (error) {
      console.error('Error collecting vehicle model:', error);
      return {
        success: false,
        error: 'Unable to validate vehicle model at this time'
      };
    }
  }
};

/**
 * Tool to collect and validate vehicle trim (Step 4)
 */
export const collectVehicleTrimTool = {
  name: 'collect_vehicle_trim',
  description: 'Collect and validate vehicle trim for the specified year, make, and model',
  parameters: {
    type: 'object',
    properties: {
      vehicleNumber: {
        type: 'number',
        description: 'Vehicle number (1 or 2)'
      },
      trim: {
        type: 'string',
        description: 'Vehicle trim (e.g., Base, LX, Sport, Limited)'
      }
    },
    required: ['vehicleNumber', 'trim']
  },
  execute: async ({ vehicleNumber, trim }) => {
    try {
      console.log(`✨ Collecting vehicle ${vehicleNumber} trim: ${trim}`);

      // Get the year, make, and model from session data
      const sessionData = global.sessionData || {};
      const vehicles = sessionData.vehicles || [];
      const vehicle = vehicles[vehicleNumber - 1];

      if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model) {
        return {
          success: false,
          error: 'Please provide the vehicle year, make, and model first.',
          nextStep: 'collect_vehicle_year'
        };
      }

      // Get available trims for validation
      const trimsData = await getValidVehicleTrims(vehicle.year.toString(), vehicle.make, vehicle.model);

      let validTrim = trim;
      if (trimsData.valid && trimsData.trims.length > 0) {
        // Try to find matching trim
        const normalizedTrim = trim.trim().toLowerCase();
        const foundTrim = trimsData.trims.find(t => t.toLowerCase() === normalizedTrim);

        if (foundTrim) {
          validTrim = foundTrim;
        } else {
          // If no exact match, suggest available trims but still accept the input
          console.log(`Trim "${trim}" not found in available trims, but accepting it`);
        }
      }

      // Store complete vehicle information in session data
      const completeVehicle = {
        vehicleNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: validTrim,
        curatedModel: vehicle.model,
        curatedTrim: validTrim,
        vehicleTypeCode: 'P', // Passenger vehicle
        collectedAt: new Date().toISOString(),
        validated: true
      };

      global.sessionData.vehicles[vehicleNumber - 1] = completeVehicle;

      console.log(`✅ Vehicle ${vehicleNumber} complete: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${validTrim}`);

      return {
        success: true,
        vehicleInfo: completeVehicle,
        message: `Perfect! I've got your ${vehicle.year} ${vehicle.make} ${vehicle.model} ${validTrim} recorded. ${vehicleNumber === 1 ? 'Do you have a second vehicle to insure?' : 'Great! Now I have both vehicles.'}`,
        nextStep: vehicleNumber === 1 ? 'ask_second_vehicle' : 'collect_personal_info'
      };

    } catch (error) {
      console.error('Error collecting vehicle trim:', error);
      return {
        success: false,
        error: 'Unable to process vehicle trim at this time'
      };
    }
  }
};

/**
 * Tool to collect personal information for insurance quote
 */
export const collectPersonalInfoTool = {
  name: 'collect_personal_info',
  description: 'Collect and store personal information for insurance quote with validation',
  parameters: {
    type: 'object',
    properties: {
      firstName: { type: 'string', description: 'First name' },
      lastName: { type: 'string', description: 'Last name' },
      email: { type: 'string', description: 'Email address' },
      phone: { type: 'string', description: 'Phone number' },
      streetAddress: { type: 'string', description: 'Street address' },
      zipCode: { type: 'string', description: 'ZIP code' },
      birthDate: { type: 'string', description: 'Birth date' },
      gender: { type: 'string', description: 'Gender (male, female, or non-binary)' },
      maritalStatus: { type: 'string', description: 'Marital status (married or single)' },
      homeOwnership: { type: 'string', description: 'Home ownership (own or rent)' },
      militaryService: { type: 'string', description: 'Military service status' },
      hasInsurance30Days: { type: 'boolean', description: 'Has had insurance for past 30 days' }
    },
    required: []
  },
  execute: async (params) => {
    try {
      console.log('Collecting personal information:', Object.keys(params));
      
      // Validate email if provided
      if (params.email && !params.email.includes('@')) {
        return {
          success: false,
          error: 'Please provide a valid email address'
        };
      }

      // Validate zip code if provided
      if (params.zipCode) {
        const zipValidation = await validateZipCode(params.zipCode);
        if (!zipValidation.valid) {
          return {
            success: false,
            error: zipValidation.error
          };
        }
        params.zipCode = zipValidation.zipcode;
      }

      // Format personal info according to QuoteWizard structure
      const personalInfo = {
        contact: {
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          primary_phone: params.phone,
          address: params.streetAddress,
          zip_code: params.zipCode,
          birthdate: params.birthDate,
          gender: params.gender,
          marital_status: params.maritalStatus === 'married' ? 'MARRIED' : 'SINGLE',
          own_or_rent: params.homeOwnership,
          military_experience: params.militaryService
        },
        coverage: {
          has_coverage: params.hasInsurance30Days ? 'YES' : 'NO'
        },
        collectedAt: new Date().toISOString(),
        validated: true
      };

      console.log('Personal information collected and validated successfully');
      
      return {
        success: true,
        message: 'Personal information recorded successfully.',
        personalInfo: personalInfo
      };

    } catch (error) {
      console.error('Error collecting personal info:', error);
      return {
        success: false,
        error: 'Unable to save personal information'
      };
    }
  }
};

/**
 * Tool to generate complete insurance quote object in QuoteWizard format
 */
export const generateInsuranceQuoteTool = {
  name: 'generate_insurance_quote',
  description: 'Generate a complete insurance quote object with all collected information in QuoteWizard format',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID for this quote'
      }
    },
    required: ['sessionId']
  },
  execute: async ({ sessionId }) => {
    try {
      console.log(`Generating insurance quote for session: ${sessionId}`);

      // Get session data
      const sessionData = global.sessionData || {};
      console.log('📊 Session data for quote generation:', sessionData);

      // Create QuoteWizard-compatible insurance object
      const insuranceQuote = {
        wizsid: sessionId,
        contact: {
          age: null,
          address: sessionData.address || "",
          addressVerified: false,
          state: sessionData.state || "",
          zip_code: sessionData.zipcode || "",
          city: sessionData.city || "",
          primary_phone: sessionData.phone || "",
          first_name: sessionData.firstName || "",
          last_name: sessionData.lastName || "",
          email: sessionData.email || "",
          own_or_rent: sessionData.ownOrRent || "",
          birthdate: sessionData.birthdate || "",
          marital_status: sessionData.maritalStatus || "",
          gender: sessionData.gender || "",
          military_experience: sessionData.militaryExperience || "",
          genderSkipped: false,
          birthdateSkipped: false
        },
        coverage: {
          has_coverage: sessionData.hasContinuousCoverage ? "yes" : "no",
          former_insurer: sessionData.currentInsurer || "",
          former_insurer_name: sessionData.currentInsurer || "",
          months_insured: sessionData.monthsWithInsurer || null
        },
        driver: [],
        vehicle: sessionData.vehicles || [],
        product: "auto",
        industry: "insurance",
        numVehicles: sessionData.vehicles ? sessionData.vehicles.length : 0,
        insuranceNeed: sessionData.needType || "",
        currentInsurer: sessionData.currentInsurer || "",
        currentPremium: sessionData.currentPremium || "",
        reasonForShopping: sessionData.reasonForShopping || "",
        collectedAt: new Date().toISOString(),
        validated: true
      };

      console.log('Insurance quote object generated successfully');

      return {
        success: true,
        message: 'Great! I have all the information needed to find you the best auto insurance rates.',
        insuranceQuote: insuranceQuote,
        nextStep: 'Processing your quote with multiple insurance companies...'
      };

    } catch (error) {
      console.error('Error generating insurance quote:', error);
      return {
        success: false,
        error: 'Unable to generate insurance quote'
      };
    }
  }
};

export default {
  askInsuranceNeedsTool,
  validateZipCodeTool,
  getVehicleMakesTool,
  collectVehicleYearTool,
  collectVehicleMakeTool,
  collectVehicleModelTool,
  collectVehicleTrimTool,
  collectPersonalInfoTool,
  generateInsuranceQuoteTool
};
