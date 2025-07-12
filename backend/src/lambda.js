import serverless from 'serverless-http';
import app from './server.js';
import { handleWebSocket } from './websocket/lambdaWebSocketHandler.js';

// Create the Lambda handler by wrapping the Express app
const httpHandler = serverless(app, {
  // Configure serverless-http options
  binary: false, // Set to true if you need to handle binary data
  basePath: '/production', // Strip the API Gateway stage prefix
  request: (request, event, context) => {
    // Add Lambda event and context to the request object
    request.event = event;
    request.context = context;

    // Add custom headers for Lambda environment
    request.headers['x-lambda-request-id'] = context.awsRequestId;
    request.headers['x-lambda-function-name'] = context.functionName;
    request.headers['x-lambda-function-version'] = context.functionVersion;
  },
  response: (response, event, context) => {
    // Add custom headers to the response
    response.headers = response.headers || {};
    response.headers['x-powered-by'] = 'AWS Lambda';
    response.headers['x-lambda-request-id'] = context.awsRequestId;
  }
});

// Main Lambda handler that routes between HTTP and WebSocket events
const handler = async (event, context) => {
  console.log('Lambda event:', JSON.stringify(event, null, 2));

  // Check if this is a WebSocket event (WebSocket events have specific routeKeys)
  if (event.requestContext && event.requestContext.routeKey &&
      (event.requestContext.routeKey === '$connect' ||
       event.requestContext.routeKey === '$disconnect' ||
       event.requestContext.routeKey === '$default')) {
    console.log('Handling WebSocket event');
    return await handleWebSocket(event, context);
  }

  // Check if this is an HTTP event (HTTP API Gateway v2.0 format)
  if (event.requestContext && (event.requestContext.http || event.httpMethod)) {
    console.log('Handling HTTP event');
    return await httpHandler(event, context);
  }

  // Unknown event type
  console.error('Unknown event type:', event);
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown event type' })
  };
};

// Export the handler for Lambda
export { handler };

// For backwards compatibility, also export as default
export default handler;
