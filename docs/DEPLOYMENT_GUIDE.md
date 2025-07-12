# Insurance Voice Agent - Complete Deployment Guide

## 📋 Table of Contents

1. [Fresh Deployment](#fresh-deployment)
2. [Application Updates](#application-updates)
3. [Environment Management](#environment-management)
4. [Troubleshooting](#troubleshooting)
5. [Monitoring & Maintenance](#monitoring--maintenance)

---

## 🚀 Fresh Deployment

### Prerequisites

Before starting, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js** (version 18+ recommended)
4. **Git** for cloning the repository
5. **OpenAI API Key** from https://platform.openai.com/account/api-keys

### Step 1: Environment Setup

```bash
# Install AWS CLI (if not already installed)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter your AWS Access Key ID
# Enter your Secret Access Key
# Enter your default region (e.g., us-east-1)
# Enter output format (json)

# Verify AWS configuration
aws sts get-caller-identity
```

### Step 2: Clone and Setup Repository

```bash
# Clone the repository
git clone https://github.com/kgptapps/insurancevoiceagent.git
cd insurancevoiceagent

# Make deployment scripts executable
chmod +x deploy/*.sh

# Install dependencies (optional - scripts will do this)
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
```

### Step 3: Configure OpenAI API Key

**Option A: Set environment variable (recommended)**
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
```

**Option B: Configure after deployment**
```bash
aws ssm put-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --value "your-openai-api-key-here" \
    --type "SecureString" \
    --overwrite \
    --region us-east-1
```

### Step 4: Deploy Application

**Complete Deployment (Recommended)**
```bash
# Deploy everything at once
./deploy/deploy-all.sh
```

**Manual Step-by-Step Deployment**
```bash
# 1. Deploy infrastructure and frontend
./deploy/deploy-frontend.sh

# 2. Deploy backend
./deploy/deploy-backend.sh

# 3. Configure OpenAI key (if not set via environment)
aws ssm put-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --value "your-openai-api-key-here" \
    --type "SecureString" \
    --overwrite
```

### Step 5: Validate Deployment

```bash
# Run validation script
./deploy/validate-deployment.sh

# Manual validation
curl https://your-api-url/production/api/health
curl -X POST https://your-api-url/production/api/session-token
```

### Step 6: Access Your Application

After successful deployment, you'll receive:
- **Frontend URL**: `https://your-cloudfront-domain.cloudfront.net`
- **API URL**: `https://your-api-id.execute-api.region.amazonaws.com/production`
- **WebSocket URL**: `wss://your-ws-id.execute-api.region.amazonaws.com/production`

---

## 🔄 Application Updates

### Frontend Updates

When you make changes to the React frontend:

```bash
# Quick frontend update
./deploy/deploy-frontend.sh

# Or deploy specific components
./deploy/deploy-all.sh frontend
```

**What gets updated:**
- React application build
- S3 bucket contents
- CloudFront cache invalidation
- Environment configuration

### Backend Updates

When you make changes to the Express.js backend:

```bash
# Quick backend update
./deploy/deploy-backend.sh

# Or deploy specific components
./deploy/deploy-all.sh backend
```

**What gets updated:**
- Lambda function code
- Dependencies (node_modules)
- Environment variables
- Function configuration

### Full Application Update

For major changes affecting both frontend and backend:

```bash
# Complete redeployment
./deploy/deploy-all.sh

# With validation
./deploy/deploy-all.sh && ./deploy/validate-deployment.sh
```

### Configuration Updates

**Update OpenAI API Key:**
```bash
aws ssm put-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --value "new-openai-api-key" \
    --type "SecureString" \
    --overwrite

# Force Lambda to reload (add cache bust)
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --environment Variables="{NODE_ENV=production,PROJECT_NAME=insurance-voice-agent,PARAMETER_PREFIX=/insurance-voice-agent,CACHE_BUST=$(date +%s)}"
```

**Update Environment Variables:**
```bash
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --environment Variables="{NODE_ENV=production,PROJECT_NAME=insurance-voice-agent,PARAMETER_PREFIX=/insurance-voice-agent,NEW_VAR=value}"
```

### Infrastructure Updates

When you modify the CloudFormation template:

```bash
# Deploy infrastructure changes
aws cloudformation deploy \
    --template-file deploy/aws-infrastructure.yml \
    --stack-name insurance-voice-agent-infrastructure-production \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1
```

---

## 🌍 Environment Management

### Multiple Environments

Deploy to different environments (development, staging, production):

```bash
# Set environment
export ENVIRONMENT=staging  # or development, production

# Deploy to specific environment
./deploy/deploy-all.sh

# Each environment gets separate resources:
# - insurance-voice-agent-frontend-staging
# - insurance-voice-agent-backend-staging
# - insurance-voice-agent-infrastructure-staging
```

### Environment-Specific Configuration

```bash
# Development
export ENVIRONMENT=development
export AWS_REGION=us-east-1

# Staging
export ENVIRONMENT=staging
export AWS_REGION=us-west-2

# Production
export ENVIRONMENT=production
export AWS_REGION=us-east-1
```

### Branch-Based Deployment

```bash
# Deploy from specific branch
git checkout feature-branch
./deploy/deploy-all.sh

# Deploy with branch name as environment
export ENVIRONMENT=$(git branch --show-current)
./deploy/deploy-all.sh
```

---

## 🐛 Troubleshooting

### Common Issues and Solutions

**1. AWS Permissions Error**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify IAM permissions
aws iam get-user
```

**2. CloudFormation Stack Failures**
```bash
# Check stack events
aws cloudformation describe-stack-events \
    --stack-name insurance-voice-agent-infrastructure-production

# Delete failed stack
aws cloudformation delete-stack \
    --stack-name insurance-voice-agent-infrastructure-production
```

**3. Lambda Function Errors**
```bash
# View Lambda logs
aws logs tail /aws/lambda/insurance-voice-agent-backend-production --follow

# Test Lambda function
aws lambda invoke \
    --function-name insurance-voice-agent-backend-production \
    --payload '{"httpMethod":"GET","path":"/api/health"}' \
    response.json
```

**4. Frontend Not Loading**
```bash
# Check S3 bucket contents
aws s3 ls s3://insurance-voice-agent-frontend-production/

# Check CloudFront distribution
aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='insurance-voice-agent-production']"
```

**5. API Gateway Issues**
```bash
# Test API directly
curl -v https://your-api-id.execute-api.us-east-1.amazonaws.com/production/api/health

# Check API Gateway logs
aws logs describe-log-groups --log-group-name-prefix "/aws/apigateway"
```

### Rollback Procedures

**Rollback Frontend:**
```bash
# Revert to previous S3 version
aws s3api list-object-versions --bucket insurance-voice-agent-frontend-production
aws s3api restore-object --bucket insurance-voice-agent-frontend-production --key index.html --version-id previous-version-id
```

**Rollback Backend:**
```bash
# Revert Lambda function
aws lambda update-function-code \
    --function-name insurance-voice-agent-backend-production \
    --zip-file fileb://previous-deployment.zip
```

---

## 📊 Monitoring & Maintenance

### Health Monitoring

```bash
# Automated health check script
#!/bin/bash
HEALTH_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com/production/api/health"
RESPONSE=$(curl -s "$HEALTH_URL")
if echo "$RESPONSE" | grep -q "ok"; then
    echo "✅ Application is healthy"
else
    echo "❌ Application health check failed"
    echo "Response: $RESPONSE"
fi
```

### Log Monitoring

```bash
# Monitor Lambda logs in real-time
aws logs tail /aws/lambda/insurance-voice-agent-backend-production --follow

# Search for errors
aws logs filter-log-events \
    --log-group-name /aws/lambda/insurance-voice-agent-backend-production \
    --filter-pattern "ERROR"

# Monitor CloudFront logs
aws logs describe-log-groups --log-group-name-prefix "/aws/cloudfront"
```

### Performance Monitoring

```bash
# Check Lambda metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Duration \
    --dimensions Name=FunctionName,Value=insurance-voice-agent-backend-production \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-02T00:00:00Z \
    --period 3600 \
    --statistics Average

# Check API Gateway metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/ApiGateway \
    --metric-name Count \
    --dimensions Name=ApiName,Value=insurance-voice-agent-http-api-production \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-02T00:00:00Z \
    --period 3600 \
    --statistics Sum
```

### Cost Monitoring

```bash
# Check AWS costs
aws ce get-cost-and-usage \
    --time-period Start=2024-01-01,End=2024-01-31 \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --group-by Type=DIMENSION,Key=SERVICE
```

### Backup and Recovery

```bash
# Backup Lambda function
aws lambda get-function \
    --function-name insurance-voice-agent-backend-production \
    --query 'Code.Location' \
    --output text | xargs curl -o backup-$(date +%Y%m%d).zip

# Backup S3 bucket
aws s3 sync s3://insurance-voice-agent-frontend-production backup-frontend-$(date +%Y%m%d)/

# Backup CloudFormation template
aws cloudformation get-template \
    --stack-name insurance-voice-agent-infrastructure-production \
    --query 'TemplateBody' > backup-template-$(date +%Y%m%d).json
```

---

## 📞 Support and Resources

### Useful Commands Reference

```bash
# Quick deployment status check
./deploy/validate-deployment.sh

# View all AWS resources
aws cloudformation describe-stack-resources \
    --stack-name insurance-voice-agent-infrastructure-production

# Clean up everything (DANGER!)
aws cloudformation delete-stack \
    --stack-name insurance-voice-agent-infrastructure-production
```

### Documentation Links

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)

For additional support, check the project's GitHub issues or create a new issue with detailed error information.
