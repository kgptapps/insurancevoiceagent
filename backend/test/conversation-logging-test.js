import realtimeSessionLogger from '../src/services/realtimeSessionLogger.js';
import conversationLogger from '../src/services/conversationLogger.js';

// Mock RealtimeSession for testing
class MockRealtimeSession {
  constructor() {
    this.history = [];
    this.eventListeners = {};
  }

  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  // Simulate a realistic insurance conversation
  simulateInsuranceConversation() {
    console.log('🎭 Simulating insurance conversation...');

    // Step 1: User asks for quote
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'user',
        content: 'Hi, I need a car insurance quote',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('transcript', {
        transcript: 'Hi, I need a car insurance quote',
        speaker: 'user',
        confidence: 0.95
      });
      console.log('👤 User: Hi, I need a car insurance quote');
    }, 500);

    // Step 2: Agent responds
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'assistant',
        content: 'I\'d be happy to help you with a car insurance quote! To get started, could you tell me what year your vehicle is?',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('response', {
        type: 'text',
        content: 'I\'d be happy to help you with a car insurance quote! To get started, could you tell me what year your vehicle is?'
      });
      console.log('🤖 Agent: I\'d be happy to help you with a car insurance quote! To get started, could you tell me what year your vehicle is?');
    }, 1500);

    // Step 3: User provides vehicle year
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'user',
        content: 'It\'s a 2020 Toyota Camry',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('transcript', {
        transcript: 'It\'s a 2020 Toyota Camry',
        speaker: 'user',
        confidence: 0.92
      });
      console.log('👤 User: It\'s a 2020 Toyota Camry');
    }, 3000);

    // Step 4: Agent asks for zip code
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'assistant',
        content: 'Great! A 2020 Toyota Camry is a popular choice. What\'s your zip code so I can check rates in your area?',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('response', {
        type: 'text',
        content: 'Great! A 2020 Toyota Camry is a popular choice. What\'s your zip code so I can check rates in your area?'
      });
      console.log('🤖 Agent: Great! A 2020 Toyota Camry is a popular choice. What\'s your zip code so I can check rates in your area?');
    }, 4000);

    // Step 5: User provides zip code
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'user',
        content: 'My zip code is 90210',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('transcript', {
        transcript: 'My zip code is 90210',
        speaker: 'user',
        confidence: 0.98
      });
      console.log('👤 User: My zip code is 90210');
    }, 5500);

    // Step 6: Tool call to get quote
    setTimeout(() => {
      this.emit('tool_call', {
        name: 'get_insurance_quote',
        arguments: { 
          vehicleYear: '2020', 
          vehicleMake: 'Toyota', 
          vehicleModel: 'Camry',
          zipCode: '90210'
        }
      });

      this.history.push({
        type: 'function_call',
        name: 'get_insurance_quote',
        arguments: { 
          vehicleYear: '2020', 
          vehicleMake: 'Toyota', 
          vehicleModel: 'Camry',
          zipCode: '90210'
        },
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      console.log('🔧 Tool Call: get_insurance_quote');
    }, 6500);

    // Step 7: Tool call result
    setTimeout(() => {
      this.emit('tool_call_result', {
        name: 'get_insurance_quote',
        result: {
          monthlyPremium: 125.50,
          coverage: 'Full Coverage',
          deductible: 500
        }
      });

      this.history.push({
        type: 'function_call_result',
        name: 'get_insurance_quote',
        result: {
          monthlyPremium: 125.50,
          coverage: 'Full Coverage',
          deductible: 500
        },
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      console.log('✅ Tool Result: Quote generated');
    }, 7000);

    // Step 8: Agent provides quote
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'assistant',
        content: 'Perfect! I found a great rate for your 2020 Toyota Camry in 90210. Your monthly premium would be $125.50 for full coverage with a $500 deductible. Would you like to proceed with this quote?',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('response', {
        type: 'text',
        content: 'Perfect! I found a great rate for your 2020 Toyota Camry in 90210. Your monthly premium would be $125.50 for full coverage with a $500 deductible. Would you like to proceed with this quote?'
      });
      console.log('🤖 Agent: Perfect! I found a great rate for your 2020 Toyota Camry in 90210. Your monthly premium would be $125.50 for full coverage with a $500 deductible. Would you like to proceed with this quote?');
    }, 8000);

    // Step 9: User accepts
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'user',
        content: 'Yes, that sounds good! How do I proceed?',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('transcript', {
        transcript: 'Yes, that sounds good! How do I proceed?',
        speaker: 'user',
        confidence: 0.96
      });
      console.log('👤 User: Yes, that sounds good! How do I proceed?');
    }, 9500);

    // Step 10: Conversation complete
    setTimeout(() => {
      this.history.push({
        type: 'message',
        role: 'assistant',
        content: 'Excellent! I\'ll send you the application link via email. You should receive it within the next few minutes. Thank you for choosing our insurance!',
        timestamp: new Date().toISOString()
      });
      this.emit('history_updated', [...this.history]);
      this.emit('response', {
        type: 'text',
        content: 'Excellent! I\'ll send you the application link via email. You should receive it within the next few minutes. Thank you for choosing our insurance!'
      });
      console.log('🤖 Agent: Excellent! I\'ll send you the application link via email. You should receive it within the next few minutes. Thank you for choosing our insurance!');
      console.log('🎬 Conversation simulation complete!');
    }, 11000);
  }
}

// Test function
async function testConversationLogging() {
  console.log('🧪 Starting Conversation Logging Test');
  console.log('=====================================');

  const sessionId = `test_session_${Date.now()}`;
  const mockSession = new MockRealtimeSession();

  try {
    // Setup logging
    console.log('📝 Setting up conversation logging...');
    const conversation = realtimeSessionLogger.setupSessionLogging(mockSession, sessionId, {
      userAgent: 'Mozilla/5.0 (Test Browser)',
      ipAddress: '127.0.0.1',
      testMode: true,
      userType: 'test_customer'
    });

    console.log(`✅ Started conversation: ${conversation.conversationId}`);
    console.log(`📋 Session ID: ${sessionId}`);
    console.log('');

    // Start conversation simulation
    mockSession.simulateInsuranceConversation();

    // Wait for conversation to complete
    console.log('⏳ Waiting for conversation to complete...');
    await new Promise(resolve => setTimeout(resolve, 12000));

    // Capture final snapshot
    console.log('📸 Capturing final conversation snapshot...');
    realtimeSessionLogger.captureSessionHistory(sessionId, 'conversation_complete');

    // Get analytics before ending
    console.log('📊 Generating conversation analytics...');
    const analytics = realtimeSessionLogger.getConversationAnalytics(sessionId);
    console.log('Analytics:', JSON.stringify(analytics, null, 2));

    // End conversation and save
    console.log('💾 Ending conversation and saving data...');
    const result = await realtimeSessionLogger.endSessionLogging(sessionId, {
      testCompleted: true,
      outcome: 'quote_accepted',
      customerSatisfaction: 'high',
      dataCollectionSuccess: true
    });

    console.log('');
    console.log('🎉 Test Completed Successfully!');
    console.log('================================');
    console.log('📊 Final Results:');
    console.log(`   Conversation ID: ${result.conversationId}`);
    console.log(`   Session ID: ${result.sessionId}`);
    console.log(`   Duration: ${result.metadata.duration.formatted}`);
    console.log(`   Total Events: ${result.metadata.totalEvents}`);
    console.log(`   History Snapshots: ${result.metadata.totalHistorySnapshots}`);
    
    if (result.s3Results) {
      console.log('📁 Files Saved:');
      if (result.s3Results.conversationFile) {
        console.log(`   📄 Conversation: ${result.s3Results.conversationFile.url || result.s3Results.conversationFile.path}`);
      }
      if (result.s3Results.summaryFile) {
        console.log(`   📋 Summary: ${result.s3Results.summaryFile.url || result.s3Results.summaryFile.path}`);
      }
      if (result.s3Results.insuranceDataFile) {
        console.log(`   🚗 Insurance Data: ${result.s3Results.insuranceDataFile.url || result.s3Results.insuranceDataFile.path}`);
      }
    }

    console.log('');
    console.log('✅ All conversation data has been logged and saved!');
    console.log('🔍 Check the output files to see the captured conversation data.');

    return result;

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Additional test for session status
async function testSessionStatus() {
  console.log('');
  console.log('🔍 Testing Session Status Functionality');
  console.log('=======================================');

  const sessionId = `status_test_${Date.now()}`;
  const mockSession = new MockRealtimeSession();

  // Setup logging
  realtimeSessionLogger.setupSessionLogging(mockSession, sessionId, {
    testMode: true,
    statusTest: true
  });

  // Simulate some activity
  mockSession.history.push({
    type: 'message',
    role: 'user',
    content: 'Test message',
    timestamp: new Date().toISOString()
  });
  mockSession.emit('history_updated', mockSession.history);

  // Check status
  const status = realtimeSessionLogger.getSessionStatus(sessionId);
  console.log('📊 Session Status:', JSON.stringify(status, null, 2));

  // Check active sessions
  const activeSessions = realtimeSessionLogger.getActiveSessions();
  console.log('📋 Active Sessions:', activeSessions.length);

  // Clean up
  await realtimeSessionLogger.endSessionLogging(sessionId);
  console.log('✅ Status test completed');
}

// Run tests
async function runAllTests() {
  try {
    await testConversationLogging();
    await testSessionStatus();
    
    console.log('');
    console.log('🎊 All Tests Passed!');
    console.log('====================');
    console.log('The conversation logging system is working correctly.');
    console.log('You can now integrate this with your real OpenAI RealtimeSession.');
    
  } catch (error) {
    console.error('💥 Test Suite Failed:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testConversationLogging, testSessionStatus, MockRealtimeSession };
