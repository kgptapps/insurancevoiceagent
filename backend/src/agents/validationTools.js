/**
 * Data validation tools using QuoteWizard APIs
 */

/**
 * Validate zip code using QuoteWizard API
 */
export const validateZipCode = async (zipcode) => {
  try {
    console.log(`Validating zip code: ${zipcode}`);
    
    // Basic format validation first
    if (!/^\d{5}(-\d{4})?$/.test(zipcode)) {
      return {
        valid: false,
        error: 'Zip code must be 5 digits (e.g., 90210) or 9 digits (e.g., 90210-1234)',
        zipcode: zipcode
      };
    }

    // Use only the 5-digit portion for API call
    const fiveDigitZip = zipcode.split('-')[0];
    
    const response = await fetch(`https://form.quotewizard.com/kube/nxrdzipcode/${fiveDigitZip}.json`);
    
    if (!response.ok) {
      console.error(`Zip code validation failed: ${response.status}`);
      return {
        valid: false,
        error: 'Unable to validate zip code. Please check and try again.',
        zipcode: zipcode
      };
    }

    const data = await response.json();
    
    // Check if zip code is valid based on response
    if (data && (data.valid !== false)) {
      console.log(`Zip code ${zipcode} is valid`);
      return {
        valid: true,
        zipcode: fiveDigitZip,
        data: data
      };
    } else {
      return {
        valid: false,
        error: 'This zip code is not valid or not serviceable.',
        zipcode: zipcode
      };
    }

  } catch (error) {
    console.error(`Error validating zip code ${zipcode}:`, error);
    return {
      valid: false,
      error: 'Unable to validate zip code at this time.',
      zipcode: zipcode
    };
  }
};

/**
 * Validate vehicle year
 */
export const validateVehicleYear = (year) => {
  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(year);
  
  if (isNaN(yearNum)) {
    return {
      valid: false,
      error: 'Please provide a valid year (e.g., 2020)',
      year: year
    };
  }
  
  if (yearNum < 1987) {
    return {
      valid: false,
      error: 'Sorry, we can only insure vehicles from 1987 and newer.',
      year: year
    };
  }
  
  if (yearNum > currentYear + 1) {
    return {
      valid: false,
      error: `Year cannot be more than ${currentYear + 1}`,
      year: year
    };
  }
  
  return {
    valid: true,
    year: yearNum.toString()
  };
};

/**
 * Get and validate vehicle makes for a specific year
 */
export const getValidVehicleMakes = async (year) => {
  try {
    // First validate the year
    const yearValidation = validateVehicleYear(year);
    if (!yearValidation.valid) {
      return yearValidation;
    }

    console.log(`Fetching vehicle makes for year: ${year}`);
    
    const response = await fetch(`https://form.quotewizard.com/kube/nxrdpolk/curated/${year}.json`);
    
    if (!response.ok) {
      console.error(`Failed to fetch makes for year ${year}: ${response.status}`);
      return {
        valid: false,
        error: `Unable to fetch vehicle makes for ${year}`,
        makes: []
      };
    }

    const data = await response.json();
    
    // Extract makes from the response
    let makes = [];
    if (Array.isArray(data)) {
      makes = data.map(item => typeof item === 'string' ? item : item.make || item.name).filter(Boolean);
    } else if (data.makes) {
      makes = data.makes;
    } else if (data.data) {
      makes = data.data.map(item => item.make || item.name).filter(Boolean);
    }

    // Remove duplicates and sort
    makes = [...new Set(makes)].sort();

    console.log(`Found ${makes.length} makes for year ${year}`);
    
    return {
      valid: true,
      year: year,
      makes: makes,
      count: makes.length
    };

  } catch (error) {
    console.error(`Error fetching vehicle makes for year ${year}:`, error);
    return {
      valid: false,
      error: 'Unable to fetch vehicle makes at this time',
      makes: []
    };
  }
};

/**
 * Validate vehicle make for a specific year
 */
export const validateVehicleMake = async (year, make) => {
  try {
    const makesData = await getValidVehicleMakes(year);
    
    if (!makesData.valid) {
      return makesData;
    }
    
    // Check if the provided make exists in the valid makes list
    const normalizedMake = make.trim().toLowerCase();
    const validMake = makesData.makes.find(m => m.toLowerCase() === normalizedMake);
    
    if (validMake) {
      return {
        valid: true,
        year: year,
        make: validMake
      };
    } else {
      return {
        valid: false,
        error: `"${make}" is not a valid make for ${year}. Available makes include: ${makesData.makes.slice(0, 5).join(', ')}${makesData.makes.length > 5 ? '...' : ''}`,
        year: year,
        make: make,
        availableMakes: makesData.makes
      };
    }

  } catch (error) {
    console.error(`Error validating vehicle make ${make} for year ${year}:`, error);
    return {
      valid: false,
      error: 'Unable to validate vehicle make at this time',
      year: year,
      make: make
    };
  }
};

/**
 * Get and validate vehicle models for a specific year and make
 */
export const getValidVehicleModels = async (year, make) => {
  try {
    // First validate year and make
    const makeValidation = await validateVehicleMake(year, make);
    if (!makeValidation.valid) {
      return makeValidation;
    }

    const validMake = makeValidation.make;
    console.log(`Fetching vehicle models for ${year} ${validMake}`);
    
    // Clean up the make name for URL
    const cleanMake = validMake.toLowerCase().replace(/\s+/g, '');
    
    const response = await fetch(`https://form.quotewizard.com/kube/nxrdpolk/curated/${year}/${cleanMake}.json`);
    
    if (!response.ok) {
      console.error(`Failed to fetch models for ${year} ${validMake}: ${response.status}`);
      return {
        valid: false,
        error: `Unable to fetch vehicle models for ${year} ${validMake}`,
        models: []
      };
    }

    const data = await response.json();
    
    // Extract models from the response
    let models = [];
    if (Array.isArray(data)) {
      models = data.map(item => typeof item === 'string' ? item : item.model || item.name).filter(Boolean);
    } else if (data.models) {
      models = data.models;
    } else if (data.data) {
      models = data.data.map(item => item.model || item.name).filter(Boolean);
    }

    // Remove duplicates and sort
    models = [...new Set(models)].sort();

    console.log(`Found ${models.length} models for ${year} ${validMake}`);
    
    return {
      valid: true,
      year: year,
      make: validMake,
      models: models,
      count: models.length
    };

  } catch (error) {
    console.error(`Error fetching vehicle models for ${year} ${make}:`, error);
    return {
      valid: false,
      error: 'Unable to fetch vehicle models at this time',
      models: []
    };
  }
};

/**
 * Validate vehicle model for a specific year and make
 */
export const validateVehicleModel = async (year, make, model) => {
  try {
    const modelsData = await getValidVehicleModels(year, make);
    
    if (!modelsData.valid) {
      return modelsData;
    }
    
    // Check if the provided model exists in the valid models list
    const normalizedModel = model.trim().toLowerCase();
    const validModel = modelsData.models.find(m => m.toLowerCase() === normalizedModel);
    
    if (validModel) {
      return {
        valid: true,
        year: year,
        make: modelsData.make,
        model: validModel
      };
    } else {
      return {
        valid: false,
        error: `"${model}" is not a valid model for ${year} ${modelsData.make}. Available models include: ${modelsData.models.slice(0, 5).join(', ')}${modelsData.models.length > 5 ? '...' : ''}`,
        year: year,
        make: modelsData.make,
        model: model,
        availableModels: modelsData.models
      };
    }

  } catch (error) {
    console.error(`Error validating vehicle model ${model} for ${year} ${make}:`, error);
    return {
      valid: false,
      error: 'Unable to validate vehicle model at this time',
      year: year,
      make: make,
      model: model
    };
  }
};

/**
 * Get and validate vehicle trims for a specific year, make, and model
 */
export const getValidVehicleTrims = async (year, make, model) => {
  try {
    // First validate year, make, and model
    const modelValidation = await validateVehicleModel(year, make, model);
    if (!modelValidation.valid) {
      return modelValidation;
    }

    const validMake = modelValidation.make;
    const validModel = modelValidation.model;
    console.log(`Fetching vehicle trims for ${year} ${validMake} ${validModel}`);
    
    // Clean up names for URL
    const cleanMake = validMake.toLowerCase().replace(/\s+/g, '');
    const cleanModel = validModel.toLowerCase().replace(/\s+/g, '');
    
    const response = await fetch(`https://form.quotewizard.com/kube/nxrdpolk/curated/${year}/${cleanMake}/${cleanModel}.json`);
    
    if (!response.ok) {
      console.error(`Failed to fetch trims for ${year} ${validMake} ${validModel}: ${response.status}`);
      return {
        valid: false,
        error: `Unable to fetch vehicle trims for ${year} ${validMake} ${validModel}`,
        trims: []
      };
    }

    const data = await response.json();
    
    // Extract trims from the response
    let trims = [];
    if (Array.isArray(data)) {
      trims = data.map(item => typeof item === 'string' ? item : item.trim || item.name).filter(Boolean);
    } else if (data.trims) {
      trims = data.trims;
    } else if (data.data) {
      trims = data.data.map(item => item.trim || item.name).filter(Boolean);
    }

    // Remove duplicates and sort
    trims = [...new Set(trims)].sort();

    console.log(`Found ${trims.length} trims for ${year} ${validMake} ${validModel}`);
    
    return {
      valid: true,
      year: year,
      make: validMake,
      model: validModel,
      trims: trims,
      count: trims.length
    };

  } catch (error) {
    console.error(`Error fetching vehicle trims for ${year} ${make} ${model}:`, error);
    return {
      valid: false,
      error: 'Unable to fetch vehicle trims at this time',
      trims: []
    };
  }
};

export default {
  validateZipCode,
  validateVehicleYear,
  getValidVehicleMakes,
  validateVehicleMake,
  getValidVehicleModels,
  validateVehicleModel,
  getValidVehicleTrims
};
