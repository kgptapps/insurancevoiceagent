# Auto Insurance Voice Agent

A conversational AI system that collects comprehensive auto insurance information through natural voice interactions using OpenAI's Realtime Voice API.

## 🏗️ Architecture

- **Backend**: Node.js with Express and WebSocket server
- **Frontend**: React with TypeScript
- **Voice AI**: OpenAI Realtime API with custom insurance agent
- **Real-time Communication**: WebSocket for audio streaming and data updates

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- OpenAI API key with Realtime API access

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here
```

4. Start the backend server:
```bash
npm run dev
```

The backend will start on:
- HTTP API: http://localhost:3001
- WebSocket: ws://localhost:3002

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will be available at http://localhost:3000

## 🎯 Features

### Voice Interaction
- Real-time voice recognition and response
- Natural conversation flow
- Interruption handling
- Voice activity detection

### Data Collection
- **Personal Information**: Name, address, contact details
- **Vehicle Information**: Make, model, year, VIN, mileage
- **Coverage Preferences**: Liability limits, deductibles, additional coverage
- **Driving History**: License info, accidents, violations, claims

### Real-time Updates
- Live form filling as you speak
- Progress tracking with visual indicators
- Conversation history display
- Session management

### Professional Features
- Multi-user session support
- Data validation and error handling
- Guardrails for professional responses
- Secure API key management

## 🔧 Usage

1. **Start the Application**: Launch both backend and frontend servers
2. **Grant Permissions**: Allow microphone access when prompted
3. **Begin Conversation**: Click "Start Recording" to begin voice interaction
4. **Provide Information**: Speak naturally about your insurance needs
5. **Monitor Progress**: Watch the form fill out in real-time
6. **Review Summary**: Get a complete summary of collected information

## 📊 API Endpoints

### Session Management
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session data
- `PATCH /api/sessions/:id` - Update session data
- `DELETE /api/sessions/:id` - Delete session

### Health & Config
- `GET /api/health` - Health check
- `GET /api/config` - Agent configuration

### WebSocket Events
- `session:start` - Start voice session
- `audio:input` - Send audio data
- `text:input` - Send text message
- `data:updated` - Receive form updates
- `agent:response` - Receive agent responses

## 🛡️ Security Features

- Server-side API key management
- Session isolation and cleanup
- Input validation and sanitization
- Professional content guardrails
- Temporary data storage only

## 🎨 Customization

### Agent Personality
Edit `backend/src/agents/insuranceAgent.js` to modify:
- Agent instructions and personality
- Conversation flow logic
- Professional guidelines

### Data Schema
Modify `backend/src/types/insurance.js` to:
- Add new form fields
- Update validation rules
- Change completion criteria

### UI Components
Customize `frontend/src/components/` to:
- Update form layout
- Modify voice controls
- Change visual styling

## 🔍 Troubleshooting

### Common Issues

**Microphone Access Denied**
- Check browser permissions
- Ensure HTTPS in production
- Try refreshing the page

**WebSocket Connection Failed**
- Verify backend server is running
- Check firewall settings
- Confirm port 3002 is available

**OpenAI API Errors**
- Verify API key is correct
- Check API quota and billing
- Ensure Realtime API access

**Audio Quality Issues**
- Check microphone settings
- Reduce background noise
- Speak clearly and at normal pace

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=voice-agent:* npm run dev
```

## 📈 Performance

- **Response Time**: <2 seconds for voice responses
- **Concurrent Users**: Supports 50+ simultaneous sessions
- **Audio Quality**: 16kHz PCM with noise suppression
- **Session Duration**: 30-minute timeout with extension

## 🚀 AWS Deployment

This application is designed to be deployed on AWS using S3 for the frontend and Lambda for the backend. The deployment has been **tested and verified** to work with real OpenAI API integration.

### 📚 Deployment Documentation

- **[Complete Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Comprehensive guide for fresh deployments
- **[Update Guide](docs/UPDATE_GUIDE.md)** - Quick reference for application updates
- **[Deployment Summary](DEPLOYMENT_SUMMARY.md)** - Technical implementation details

### ✅ Quick Start (Verified)

**One-Command Deployment** - Deploy everything at once:

```bash
# Clone and navigate to the repository
git clone https://github.com/kgptapps/insurancevoiceagent.git
cd insurancevoiceagent

# Set your OpenAI API key (optional - can be set later)
export OPENAI_API_KEY="your-openai-api-key-here"

# Deploy everything
./deploy/deploy-all.sh
```

**Validate Deployment**:
```bash
./deploy/validate-deployment.sh
```

### 📋 Prerequisites

1. **AWS CLI** installed and configured:
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, Region, and Output format
   ```

2. **Node.js and npm** installed (version 18+ recommended)

3. **OpenAI API key** from https://platform.openai.com/account/api-keys

### 🔧 Manual Deployment Steps

If you prefer step-by-step deployment:

1. **Deploy Infrastructure & Frontend**:
   ```bash
   ./deploy/deploy-frontend.sh
   ```

2. **Deploy Backend to Lambda**:
   ```bash
   ./deploy/deploy-backend.sh
   ```

3. **Configure OpenAI API Key**:
   ```bash
   aws ssm put-parameter \
       --name "/insurance-voice-agent/openai-api-key" \
       --value "your-actual-openai-api-key" \
       --type "SecureString" \
       --overwrite \
       --region us-east-1
   ```

### 🏗️ AWS Architecture

- **Frontend**: React app hosted on S3 with CloudFront CDN
- **Backend**: Express.js app running on AWS Lambda (Node.js 22.x)
- **API Gateway**: HTTP API for REST endpoints + WebSocket API for real-time voice
- **Systems Manager**: Secure encrypted storage for OpenAI API keys
- **IAM**: Least privilege access roles for all services
- **CloudWatch**: Automatic logging and monitoring

### 💰 Cost Estimate

- **Monthly Cost**: ~$10-50 for moderate usage
- **Pay-per-use**: Only charged for actual traffic
- **Auto-scaling**: Handles traffic spikes automatically
- **No fixed costs**: Serverless architecture

### 🧪 Testing Your Deployment

After deployment, you'll receive URLs like:
- **Frontend**: `https://d3angx33rsj63i.cloudfront.net`
- **API**: `https://your-api-id.execute-api.us-east-1.amazonaws.com/production`
- **WebSocket**: `wss://your-ws-id.execute-api.us-east-1.amazonaws.com/production`

Test the health endpoint:
```bash
curl https://your-api-id.execute-api.us-east-1.amazonaws.com/production/api/health
```

### 🔄 Redeployment

To update your deployment:

```bash
# Frontend only
./deploy/deploy-frontend.sh

# Backend only
./deploy/deploy-backend.sh

# Complete redeployment
./deploy/deploy-all.sh
```

### 🐛 Troubleshooting

**View Lambda logs**:
```bash
aws logs tail /aws/lambda/insurance-voice-agent-backend-production --follow
```

**Check deployment status**:
```bash
./deploy/validate-deployment.sh
```

**Common issues**:
1. **Build failures**: Check Node.js version and dependencies
2. **AWS permissions**: Verify IAM credentials and policies
3. **CloudFront delays**: Wait 10-15 minutes for global propagation
4. **API errors**: Check Lambda logs in CloudWatch

### 💻 Local Development

For local development, use the traditional setup:

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in another terminal)
cd frontend
npm install
npm start
```

The local development environment will use your `.env` file for configuration, while the deployed version uses AWS Systems Manager for secure parameter storage.

## 📄 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Open an issue on GitHub

---

**Built with ❤️ using OpenAI Realtime API**
