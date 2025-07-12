// Environment configuration for different deployment environments

interface EnvironmentConfig {
  apiUrl: string;
  wsUrl: string;
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
  openaiModel: string;
}

// Get environment variables with fallbacks
const getEnvVar = (name: string, fallback: string = ''): string => {
  return process.env[name] || fallback;
};

// Determine current environment
const getCurrentEnvironment = (): 'development' | 'staging' | 'production' => {
  const env = getEnvVar('REACT_APP_ENVIRONMENT', 'development');
  if (env === 'staging' || env === 'production') {
    return env;
  }
  return 'development';
};

// Environment-specific configurations
const environments: Record<string, EnvironmentConfig> = {
  development: {
    apiUrl: getEnvVar('REACT_APP_API_URL', 'http://localhost:3001'),
    wsUrl: getEnvVar('REACT_APP_WS_URL', 'ws://localhost:3002'),
    environment: 'development',
    debug: true,
    openaiModel: 'gpt-4o-realtime-preview-2025-06-03'
  },
  
  staging: {
    apiUrl: getEnvVar('REACT_APP_API_URL', ''),
    wsUrl: getEnvVar('REACT_APP_WS_URL', ''),
    environment: 'staging',
    debug: true,
    openaiModel: 'gpt-4o-realtime-preview-2025-06-03'
  },
  
  production: {
    apiUrl: getEnvVar('REACT_APP_API_URL', ''),
    wsUrl: getEnvVar('REACT_APP_WS_URL', ''),
    environment: 'production',
    debug: false,
    openaiModel: 'gpt-4o-realtime-preview-2025-06-03'
  }
};

// Get current configuration
const currentEnv = getCurrentEnvironment();
const config = environments[currentEnv];

// Validation
if (!config.apiUrl) {
  console.error(`Missing REACT_APP_API_URL for environment: ${currentEnv}`);
}

if (!config.wsUrl) {
  console.error(`Missing REACT_APP_WS_URL for environment: ${currentEnv}`);
}

// Export configuration
export const environment: EnvironmentConfig = config;

// Export individual values for convenience
export const {
  apiUrl,
  wsUrl,
  environment: environmentName,
  debug,
  openaiModel
} = config;

// Helper functions
export const isDevelopment = () => currentEnv === 'development';
export const isStaging = () => currentEnv === 'staging';
export const isProduction = () => currentEnv === 'production';

// Log configuration in development
if (isDevelopment()) {
  console.log('Environment Configuration:', {
    environment: currentEnv,
    apiUrl: config.apiUrl,
    wsUrl: config.wsUrl,
    debug: config.debug
  });
}

export default environment;
