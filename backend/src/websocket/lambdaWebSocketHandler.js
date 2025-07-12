import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import sessionManager from '../services/sessionManager.js';

// Store active WebSocket connections
const connections = new Map();

// Initialize API Gateway Management API client
let apiGatewayClient = null;

function getApiGatewayClient(event) {
  if (!apiGatewayClient) {
    const { domainName, stage } = event.requestContext;
    const endpoint = `https://${domainName}/${stage}`;
    
    apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }
  return apiGatewayClient;
}

/**
 * Send message to a specific WebSocket connection
 */
async function sendToConnection(connectionId, data, event) {
  try {
    const client = getApiGatewayClient(event);
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(data)
    });
    
    await client.send(command);
    console.log(`Message sent to connection ${connectionId}`);
  } catch (error) {
    console.error(`Failed to send message to connection ${connectionId}:`, error);
    
    // If connection is stale, remove it
    if (error.statusCode === 410) {
      connections.delete(connectionId);
      console.log(`Removed stale connection ${connectionId}`);
    }
    
    throw error;
  }
}

/**
 * Broadcast message to all connected clients
 */
async function broadcast(data, event) {
  const promises = Array.from(connections.keys()).map(connectionId => 
    sendToConnection(connectionId, data, event).catch(error => {
      console.error(`Failed to broadcast to ${connectionId}:`, error);
    })
  );
  
  await Promise.all(promises);
}

/**
 * Handle WebSocket connection
 */
async function handleConnect(event) {
  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters || {};
  
  console.log(`WebSocket connection established: ${connectionId}`);
  
  // Store connection info
  connections.set(connectionId, {
    connectionId,
    connectedAt: new Date().toISOString(),
    sessionId: queryParams.sessionId || null,
    userId: queryParams.userId || null
  });
  
  // Send welcome message
  await sendToConnection(connectionId, {
    type: 'connection:established',
    payload: {
      connectionId,
      message: 'WebSocket connection established'
    }
  }, event);
  
  return {
    statusCode: 200,
    body: 'Connected'
  };
}

/**
 * Handle WebSocket disconnection
 */
async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;
  
  console.log(`WebSocket connection closed: ${connectionId}`);
  
  // Remove connection
  const connection = connections.get(connectionId);
  if (connection && connection.sessionId) {
    // Clean up any associated session
    try {
      sessionManager.deleteSession(connection.sessionId);
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }
  
  connections.delete(connectionId);
  
  return {
    statusCode: 200,
    body: 'Disconnected'
  };
}

/**
 * Handle WebSocket messages
 */
async function handleMessage(event) {
  const connectionId = event.requestContext.connectionId;
  const connection = connections.get(connectionId);
  
  if (!connection) {
    console.error(`Connection not found: ${connectionId}`);
    return {
      statusCode: 400,
      body: 'Connection not found'
    };
  }
  
  try {
    const message = JSON.parse(event.body);
    console.log(`Received message from ${connectionId}:`, message.type);
    
    // Handle different message types
    switch (message.type) {
      case 'session:start':
        await handleSessionStart(connectionId, message, event);
        break;
        
      case 'audio:input':
        await handleAudioInput(connectionId, message, event);
        break;
        
      case 'text:input':
        await handleTextInput(connectionId, message, event);
        break;
        
      case 'session:end':
        await handleSessionEnd(connectionId, message, event);
        break;
        
      case 'ping':
        await sendToConnection(connectionId, { type: 'pong', payload: {} }, event);
        break;
        
      default:
        console.warn(`Unknown message type: ${message.type}`);
        await sendToConnection(connectionId, {
          type: 'error',
          payload: { error: `Unknown message type: ${message.type}` }
        }, event);
    }
    
  } catch (error) {
    console.error('Error handling message:', error);
    await sendToConnection(connectionId, {
      type: 'error',
      payload: { error: 'Failed to process message' }
    }, event);
  }
  
  return {
    statusCode: 200,
    body: 'Message processed'
  };
}

/**
 * Handle session start
 */
async function handleSessionStart(connectionId, message, event) {
  try {
    const { sessionId, config } = message.payload;
    
    // Create or get session
    let session;
    if (sessionId) {
      session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
    } else {
      session = sessionManager.createSession();
    }
    
    // Update connection with session info
    const connection = connections.get(connectionId);
    connection.sessionId = session.id;
    connections.set(connectionId, connection);
    
    // Send session info back
    await sendToConnection(connectionId, {
      type: 'session:started',
      payload: {
        sessionId: session.id,
        status: session.status,
        data: session.data
      }
    }, event);
    
  } catch (error) {
    console.error('Error starting session:', error);
    await sendToConnection(connectionId, {
      type: 'session:error',
      payload: { error: error.message }
    }, event);
  }
}

/**
 * Handle audio input (placeholder - real implementation would integrate with OpenAI)
 */
async function handleAudioInput(connectionId, message, event) {
  try {
    const { sessionId, audioData, format } = message.payload;
    
    // Validate session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // For now, just acknowledge receipt
    // In a full implementation, this would:
    // 1. Forward audio to OpenAI Realtime API
    // 2. Handle the response
    // 3. Send back audio/text response
    
    await sendToConnection(connectionId, {
      type: 'audio:received',
      payload: {
        sessionId,
        message: 'Audio received and processing'
      }
    }, event);
    
  } catch (error) {
    console.error('Error handling audio input:', error);
    await sendToConnection(connectionId, {
      type: 'audio:error',
      payload: { error: error.message }
    }, event);
  }
}

/**
 * Handle text input
 */
async function handleTextInput(connectionId, message, event) {
  try {
    const { sessionId, message: textMessage } = message.payload;
    
    // Validate session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Add message to conversation history
    session.conversationHistory.push({
      id: Date.now().toString(),
      type: 'user',
      content: textMessage,
      timestamp: new Date()
    });
    
    // Echo back for now (in real implementation, would process with OpenAI)
    await sendToConnection(connectionId, {
      type: 'agent:response',
      payload: {
        sessionId,
        message: `I received your message: "${textMessage}". This is a placeholder response.`,
        type: 'confirmation'
      }
    }, event);
    
  } catch (error) {
    console.error('Error handling text input:', error);
    await sendToConnection(connectionId, {
      type: 'text:error',
      payload: { error: error.message }
    }, event);
  }
}

/**
 * Handle session end
 */
async function handleSessionEnd(connectionId, message, event) {
  try {
    const { sessionId } = message.payload;
    
    // Clean up session
    sessionManager.deleteSession(sessionId);
    
    // Update connection
    const connection = connections.get(connectionId);
    if (connection) {
      connection.sessionId = null;
      connections.set(connectionId, connection);
    }
    
    await sendToConnection(connectionId, {
      type: 'session:ended',
      payload: { sessionId }
    }, event);
    
  } catch (error) {
    console.error('Error ending session:', error);
    await sendToConnection(connectionId, {
      type: 'session:error',
      payload: { error: error.message }
    }, event);
  }
}

/**
 * Main WebSocket handler for Lambda
 */
export async function handleWebSocket(event) {
  const { routeKey } = event.requestContext;
  
  console.log(`WebSocket route: ${routeKey}`);
  
  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(event);
        
      case '$disconnect':
        return await handleDisconnect(event);
        
      case '$default':
        return await handleMessage(event);
        
      default:
        console.warn(`Unknown route: ${routeKey}`);
        return {
          statusCode: 400,
          body: `Unknown route: ${routeKey}`
        };
    }
  } catch (error) {
    console.error('WebSocket handler error:', error);
    return {
      statusCode: 500,
      body: 'Internal server error'
    };
  }
}

export default handleWebSocket;
