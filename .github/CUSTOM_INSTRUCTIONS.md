# Custom Instructions for Insurance Voice Agent Project

## Project Overview
This is an insurance voice agent application using OpenAI's Realtime Voice API for data collection demos. The project consists of a React TypeScript frontend and Node.js backend with WebSocket communication.

## Key Implementation Guidelines

### 1. Voice Agent Architecture
- **Primary Reference**: https://openai.github.io/openai-agents-js/guides/voice-agents/build/
- **Secondary Reference**: https://github.com/dkundel-openai/aie-voice-agents-workshop
- **Official Documentation**: https://openai.github.io/openai-agents-js/guides/voice-agents/

### 2. Backend Implementation
- Use backend services instead of direct browser-to-OpenAI API calls to avoid browser-related issues
- OpenAI API keys must be configured in backend `.env` files (never in frontend)
- Backend should handle WebSocket connections and proxy to OpenAI Realtime API
- Use proper audio format handling (PCM16 at 16kHz sample rate)

### 3. Frontend Implementation
- React TypeScript application with voice controls
- WebSocket client integration for real-time communication
- Browser Audio APIs for microphone access and audio playback
- Display collected data as JSON in real-time
- Use conversational/social interaction to gather information rather than direct questioning

### 4. Audio Configuration
- **Input Audio Format**: PCM16, 16kHz sample rate, mono channel
- **Output Audio Format**: PCM16, 16kHz sample rate, mono channel
- **Voice**: Use 'alloy' for warm, professional female voice
- **Turn Detection**: Server-side VAD with appropriate thresholds

### 5. Data Collection Approach
- Use conversational/social interaction patterns
- Display collected data as JSON in real-time
- Extract information naturally from conversation flow
- Avoid direct questioning - make it feel like a natural conversation

### 6. Git Repository Management
- Repository: git@github.com:kgptapps/insurancevoiceagent.git
- Always exclude `.env` files in `.gitignore`
- Include both backend and frontend in the same repository
- Commit with descriptive messages about voice agent functionality

### 7. Project Structure
```
insurancevoiceagent/
├── .github/
│   └── CUSTOM_INSTRUCTIONS.md
├── .gitignore
├── PRD.md
├── PROGRESS.md
├── README.md
├── TECHNICAL_SPECS.md
├── backend/
│   ├── .env.example
│   ├── .env (excluded)
│   ├── package.json
│   └── src/
│       ├── agents/
│       ├── services/
│       └── server.js
└── frontend/
    ├── package.json
    ├── src/
    │   ├── components/
    │   ├── services/
    │   └── types/
    └── public/
```

### 8. Development Workflow
- Always check official OpenAI documentation first
- Test audio functionality thoroughly (both input and output)
- Use proper error handling for audio permissions and WebSocket connections
- Implement graceful fallbacks for audio issues
- Create comprehensive documentation (PRD, progress tracking)

### 9. User Preferences
- User prefers building voice agents for insurance domain applications
- User prefers using backend services for API security
- User prefers creating PRDs and progress documents for project handoffs
- User prefers voice agents to display collected data as JSON in real-time
- User prefers conversational interaction over direct questioning

### 10. Common Issues to Avoid
- Browser audio context suspension (always resume on user interaction)
- Sample rate mismatches between frontend and backend
- Missing audio event handlers in WebSocket communication
- Direct browser-to-OpenAI connections (security risk)
- Hardcoded API keys in frontend code

### 11. Testing Guidelines
- Always test audio input (microphone) and output (speakers)
- Verify WebSocket connection stability
- Test conversation flow and data extraction
- Ensure proper error handling and user feedback
- Test on different browsers and devices

### 12. Documentation Requirements
- Maintain PRD.md with product requirements
- Update PROGRESS.md with implementation status
- Keep TECHNICAL_SPECS.md current with architecture details
- Document any deviations from standard patterns

## Implementation Priority
1. Follow official OpenAI documentation patterns
2. Ensure audio functionality works properly
3. Implement secure backend API handling
4. Create natural conversational experience
5. Display real-time data collection
6. Maintain comprehensive documentation
