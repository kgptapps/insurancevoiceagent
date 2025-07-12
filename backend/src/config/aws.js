import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Initialize SSM client
const ssmClient = new SSMClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

// Cache for parameters to avoid repeated API calls
const parameterCache = new Map();

/**
 * Get a parameter from AWS Systems Manager Parameter Store
 * @param {string} parameterName - The name of the parameter
 * @param {boolean} decrypt - Whether to decrypt SecureString parameters
 * @returns {Promise<string>} The parameter value
 */
export async function getParameter(parameterName, decrypt = true) {
  // Check cache first
  if (parameterCache.has(parameterName)) {
    return parameterCache.get(parameterName);
  }

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: decrypt
    });

    const response = await ssmClient.send(command);
    const value = response.Parameter.Value;

    // Cache the value for future use
    parameterCache.set(parameterName, value);

    return value;
  } catch (error) {
    console.error(`Error getting parameter ${parameterName}:`, error);
    throw new Error(`Failed to get parameter: ${parameterName}`);
  }
}

/**
 * Get multiple parameters from AWS Systems Manager Parameter Store
 * @param {string[]} parameterNames - Array of parameter names
 * @param {boolean} decrypt - Whether to decrypt SecureString parameters
 * @returns {Promise<Object>} Object with parameter names as keys and values
 */
export async function getParameters(parameterNames, decrypt = true) {
  const results = {};
  
  // Get parameters in parallel
  const promises = parameterNames.map(async (name) => {
    try {
      const value = await getParameter(name, decrypt);
      results[name] = value;
    } catch (error) {
      console.error(`Failed to get parameter ${name}:`, error);
      results[name] = null;
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Get OpenAI API key from Parameter Store
 * @returns {Promise<string>} The OpenAI API key
 */
export async function getOpenAIApiKey() {
  const projectName = process.env.PROJECT_NAME || 'insurance-voice-agent';
  const parameterName = `/${projectName}/openai-api-key`;
  
  try {
    return await getParameter(parameterName, true);
  } catch (error) {
    console.error('Failed to get OpenAI API key from Parameter Store:', error);
    
    // Fallback to environment variable for local development
    if (process.env.OPENAI_API_KEY) {
      console.warn('Using OPENAI_API_KEY from environment variable as fallback');
      return process.env.OPENAI_API_KEY;
    }
    
    throw new Error('OpenAI API key not found in Parameter Store or environment variables');
  }
}

/**
 * Check if running in Lambda environment
 * @returns {boolean} True if running in Lambda
 */
export function isLambdaEnvironment() {
  return !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_RUNTIME_DIR);
}

/**
 * Get Lambda context information
 * @param {Object} request - Express request object (may contain Lambda context)
 * @returns {Object} Lambda context information
 */
export function getLambdaContext(request) {
  if (request && request.context) {
    return {
      requestId: request.context.awsRequestId,
      functionName: request.context.functionName,
      functionVersion: request.context.functionVersion,
      memoryLimitInMB: request.context.memoryLimitInMB,
      remainingTimeInMillis: request.context.getRemainingTimeInMillis()
    };
  }
  
  return {
    requestId: process.env.AWS_REQUEST_ID || 'local',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || 'local',
    memoryLimitInMB: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'unknown',
    remainingTimeInMillis: null
  };
}

/**
 * Clear parameter cache (useful for testing or forced refresh)
 */
export function clearParameterCache() {
  parameterCache.clear();
}

export default {
  getParameter,
  getParameters,
  getOpenAIApiKey,
  isLambdaEnvironment,
  getLambdaContext,
  clearParameterCache
};
