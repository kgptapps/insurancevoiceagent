# AWS Deployment Guide for Insurance Voice Agent

This directory contains all the necessary files and scripts to deploy the Insurance Voice Agent to AWS.

## 📁 Files Overview

- `aws-infrastructure.yml` - CloudFormation template for all AWS resources
- `deploy-frontend.sh` - Complete frontend deployment script
- `deploy-backend.sh` - Backend Lambda deployment script (coming next)
- `README.md` - This deployment guide

## 🚀 Quick Start Deployment

### Prerequisites

1. **AWS CLI installed and configured**:
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, Region, and Output format
   ```

2. **Node.js and npm installed** (for building the frontend)

3. **OpenAI API Key** ready for configuration

### Option 1: Complete Deployment (Recommended)

Deploy everything at once:

```bash
# Set your OpenAI API key (optional - can be set later)
export OPENAI_API_KEY="your-openai-api-key-here"

# Run complete deployment
./deploy/deploy-all.sh
```

### Option 2: Step-by-Step Deployment

#### Step 1: Deploy Frontend to S3 + CloudFront

```bash
./deploy/deploy-frontend.sh
```

#### Step 2: Deploy Backend to Lambda

```bash
./deploy/deploy-backend.sh
```

#### Step 3: Configure OpenAI API Key

```bash
aws ssm put-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --value "your-actual-openai-api-key-here" \
    --type "SecureString" \
    --overwrite
```

### Option 3: Individual Component Deployment

```bash
# Deploy only frontend
./deploy/deploy-all.sh frontend

# Deploy only backend
./deploy/deploy-all.sh backend

# Test deployment
./deploy/deploy-all.sh test
```

## 🔧 Configuration Options

### Environment Variables

You can customize the deployment by setting these environment variables:

```bash
export ENVIRONMENT=production        # or staging, development
export AWS_REGION=us-east-1         # your preferred AWS region
export PROJECT_NAME=insurance-voice-agent
```

### Custom Domain (Optional)

To use a custom domain, update the CloudFormation template parameter:

```bash
aws cloudformation deploy \
    --template-file deploy/aws-infrastructure.yml \
    --stack-name insurance-voice-agent-infrastructure-production \
    --parameter-overrides \
        ProjectName=insurance-voice-agent \
        Environment=production \
        DomainName=your-domain.com \
    --capabilities CAPABILITY_NAMED_IAM
```

## 📊 What Gets Created

### AWS Resources

1. **S3 Bucket**: `insurance-voice-agent-frontend-production`
   - Static website hosting enabled
   - Public read access for website files
   - CORS configuration for API calls

2. **CloudFront Distribution**
   - Global CDN for fast content delivery
   - HTTPS redirect enabled
   - Custom error pages for SPA routing
   - Optimized caching rules

3. **Lambda Function**: `insurance-voice-agent-backend-production`
   - Node.js 22.x runtime
   - 512MB memory, 30-second timeout
   - IAM role with Systems Manager access

4. **API Gateway**
   - HTTP API for REST endpoints
   - WebSocket API for real-time communication
   - CORS enabled for frontend domain

5. **Systems Manager Parameter**
   - Secure storage for OpenAI API key
   - Encrypted with AWS KMS

### Frontend Build Configuration

The deployment automatically creates a production environment file:

```env
REACT_APP_API_URL=https://your-api-id.execute-api.region.amazonaws.com/production
REACT_APP_WS_URL=wss://your-ws-api-id.execute-api.region.amazonaws.com/production
REACT_APP_ENVIRONMENT=production
GENERATE_SOURCEMAP=false
```

## 🔍 Monitoring and Troubleshooting

### Check Deployment Status

```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks \
    --stack-name insurance-voice-agent-infrastructure-production

# Check S3 bucket contents
aws s3 ls s3://insurance-voice-agent-frontend-production/

# Check CloudFront distribution status
aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='insurance-voice-agent-production'].{Id:Id,Status:Status,DomainName:DomainName}"
```

### Common Issues

1. **Build Fails**: Check Node.js version and dependencies
2. **S3 Upload Fails**: Verify AWS credentials and bucket permissions
3. **CloudFront Not Working**: Wait 10-15 minutes for distribution to deploy
4. **API Calls Fail**: Check CORS configuration and API Gateway URLs

### Logs and Debugging

```bash
# View CloudFormation events
aws cloudformation describe-stack-events \
    --stack-name insurance-voice-agent-infrastructure-production

# Check Lambda logs (after backend deployment)
aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/insurance-voice-agent"
```

## 🔄 Updates and Redeployment

### Frontend Updates

To deploy frontend changes:

```bash
./deploy/deploy-frontend.sh
```

This will rebuild and redeploy only the frontend, preserving the infrastructure.

### Infrastructure Updates

To update AWS resources, modify `aws-infrastructure.yml` and run:

```bash
aws cloudformation deploy \
    --template-file deploy/aws-infrastructure.yml \
    --stack-name insurance-voice-agent-infrastructure-production \
    --capabilities CAPABILITY_NAMED_IAM
```

## 💰 Cost Optimization

### S3 Storage Class

For cost optimization, consider using S3 Intelligent Tiering:

```bash
aws s3api put-bucket-intelligent-tiering-configuration \
    --bucket insurance-voice-agent-frontend-production \
    --id EntireBucket \
    --intelligent-tiering-configuration Id=EntireBucket,Status=Enabled,Filter={},Tierings=[{Days=1,AccessTier=ARCHIVE_ACCESS},{Days=90,AccessTier=DEEP_ARCHIVE_ACCESS}]
```

### CloudFront Caching

The deployment uses optimized caching rules:
- Static assets (JS, CSS, images): 1 year cache
- HTML files: No cache (immediate updates)
- API calls: No cache

## 🔐 Security Considerations

1. **API Keys**: Stored securely in AWS Systems Manager
2. **HTTPS**: Enforced via CloudFront
3. **CORS**: Configured for specific domains only
4. **IAM**: Least privilege access for all resources

## 📞 Support

If you encounter issues:

1. Check the AWS CloudFormation console for stack events
2. Review the deployment script output for errors
3. Verify AWS credentials and permissions
4. Check the AWS service limits in your region

## 🎯 Next Steps

After successful frontend deployment:

1. ✅ Frontend deployed to S3 + CloudFront
2. 🔄 Deploy backend to Lambda (next phase)
3. 🔧 Configure WebSocket API for voice features
4. 🧪 Test end-to-end voice functionality
5. 📊 Set up monitoring and alerts
