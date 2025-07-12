# Quick Update Guide - Insurance Voice Agent

## 🔄 Common Update Scenarios

### Frontend Code Changes

When you modify React components, styles, or frontend logic:

```bash
# Quick frontend update
./deploy/deploy-frontend.sh

# What happens:
# ✅ Builds React app with latest changes
# ✅ Uploads to S3 bucket
# ✅ Invalidates CloudFront cache
# ✅ Updates environment configuration
```

### Backend Code Changes

When you modify Express.js routes, business logic, or backend functionality:

```bash
# Quick backend update
./deploy/deploy-backend.sh

# What happens:
# ✅ Packages backend code with dependencies
# ✅ Updates Lambda function
# ✅ Refreshes environment variables
# ✅ Tests function deployment
```

### Configuration Changes

**Update OpenAI API Key:**
```bash
aws ssm put-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --value "new-api-key" \
    --type "SecureString" \
    --overwrite

# Force Lambda to reload
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --environment Variables="{NODE_ENV=production,PROJECT_NAME=insurance-voice-agent,PARAMETER_PREFIX=/insurance-voice-agent,CACHE_BUST=$(date +%s)}"
```

**Update Environment Variables:**
```bash
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --environment Variables="{NODE_ENV=production,PROJECT_NAME=insurance-voice-agent,PARAMETER_PREFIX=/insurance-voice-agent,NEW_VARIABLE=value}"
```

### Full Application Update

For major changes or when unsure what changed:

```bash
# Complete redeployment
./deploy/deploy-all.sh

# With validation
./deploy/deploy-all.sh && ./deploy/validate-deployment.sh
```

---

## 🚀 Development Workflow

### 1. Local Development

```bash
# Start backend
cd backend
npm run dev

# Start frontend (new terminal)
cd frontend
npm start

# Test locally at http://localhost:3000
```

### 2. Testing Changes

```bash
# Run tests (if available)
cd backend && npm test
cd frontend && npm test

# Manual testing
curl http://localhost:3001/api/health
```

### 3. Deploy to Staging

```bash
# Set staging environment
export ENVIRONMENT=staging

# Deploy changes
./deploy/deploy-all.sh

# Test staging deployment
./deploy/validate-deployment.sh
```

### 4. Deploy to Production

```bash
# Set production environment
export ENVIRONMENT=production

# Deploy to production
./deploy/deploy-all.sh

# Validate production deployment
./deploy/validate-deployment.sh
```

---

## 📦 Dependency Updates

### Frontend Dependencies

```bash
cd frontend

# Update specific package
npm update package-name

# Update all packages
npm update

# Check for outdated packages
npm outdated

# Deploy updated frontend
cd ..
./deploy/deploy-frontend.sh
```

### Backend Dependencies

```bash
cd backend

# Update specific package
npm update package-name

# Update all packages
npm update

# Check for security vulnerabilities
npm audit
npm audit fix

# Deploy updated backend
cd ..
./deploy/deploy-backend.sh
```

---

## 🔧 Infrastructure Updates

### CloudFormation Template Changes

When you modify `deploy/aws-infrastructure.yml`:

```bash
# Deploy infrastructure changes
aws cloudformation deploy \
    --template-file deploy/aws-infrastructure.yml \
    --stack-name insurance-voice-agent-infrastructure-production \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1

# Verify changes
aws cloudformation describe-stacks \
    --stack-name insurance-voice-agent-infrastructure-production
```

### Lambda Configuration Updates

```bash
# Update memory size
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --memory-size 1024

# Update timeout
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --timeout 60

# Update runtime
aws lambda update-function-configuration \
    --function-name insurance-voice-agent-backend-production \
    --runtime nodejs22.x
```

---

## 🐛 Quick Troubleshooting

### Deployment Fails

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
    --stack-name insurance-voice-agent-infrastructure-production

# Check Lambda logs
aws logs tail /aws/lambda/insurance-voice-agent-backend-production --follow

# Validate deployment
./deploy/validate-deployment.sh
```

### Frontend Not Updating

```bash
# Force CloudFront cache invalidation
aws cloudfront create-invalidation \
    --distribution-id YOUR_DISTRIBUTION_ID \
    --paths "/*"

# Check S3 bucket contents
aws s3 ls s3://insurance-voice-agent-frontend-production/
```

### Backend API Errors

```bash
# Test API health
curl https://your-api-url/production/api/health

# Check Lambda logs
aws logs tail /aws/lambda/insurance-voice-agent-backend-production --since 10m

# Test specific endpoint
curl -X POST https://your-api-url/production/api/session-token
```

### OpenAI Integration Issues

```bash
# Verify API key is set
aws ssm get-parameter \
    --name "/insurance-voice-agent/openai-api-key" \
    --with-decryption

# Test OpenAI connection
curl -X POST https://your-api-url/production/api/session-token \
    -H "Content-Type: application/json"
```

---

## 📊 Monitoring Updates

### Check Deployment Status

```bash
# Quick health check
curl https://your-api-url/production/api/health

# Full validation
./deploy/validate-deployment.sh

# Check all AWS resources
aws cloudformation describe-stack-resources \
    --stack-name insurance-voice-agent-infrastructure-production
```

### Monitor Performance

```bash
# Lambda metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Duration \
    --dimensions Name=FunctionName,Value=insurance-voice-agent-backend-production \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Average,Maximum

# API Gateway metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/ApiGateway \
    --metric-name Count \
    --dimensions Name=ApiName,Value=insurance-voice-agent-http-api-production \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Sum
```

---

## 🔄 Rollback Procedures

### Quick Rollback

```bash
# Rollback to previous Lambda version
aws lambda update-function-code \
    --function-name insurance-voice-agent-backend-production \
    --zip-file fileb://backup/previous-deployment.zip

# Rollback frontend (restore from backup)
aws s3 sync backup/frontend-backup/ s3://insurance-voice-agent-frontend-production/

# Invalidate CloudFront
aws cloudfront create-invalidation \
    --distribution-id YOUR_DISTRIBUTION_ID \
    --paths "/*"
```

### Emergency Procedures

```bash
# Stop all traffic (disable API Gateway)
aws apigateway update-stage \
    --rest-api-id YOUR_API_ID \
    --stage-name production \
    --patch-ops op=replace,path=/throttle/rateLimit,value=0

# Restore from backup
./scripts/restore-from-backup.sh

# Re-enable traffic
aws apigateway update-stage \
    --rest-api-id YOUR_API_ID \
    --stage-name production \
    --patch-ops op=replace,path=/throttle/rateLimit,value=10000
```

---

## 📋 Update Checklist

Before deploying updates:

- [ ] Test changes locally
- [ ] Update version numbers
- [ ] Run security audit (`npm audit`)
- [ ] Backup current deployment
- [ ] Deploy to staging first
- [ ] Validate staging deployment
- [ ] Deploy to production
- [ ] Validate production deployment
- [ ] Monitor for errors
- [ ] Update documentation if needed

After deploying updates:

- [ ] Verify all endpoints work
- [ ] Check application functionality
- [ ] Monitor logs for errors
- [ ] Test voice functionality
- [ ] Verify OpenAI integration
- [ ] Check performance metrics
- [ ] Update team/stakeholders

---

## 🆘 Emergency Contacts

For critical issues:

1. **Check AWS Service Health**: https://status.aws.amazon.com/
2. **OpenAI Status**: https://status.openai.com/
3. **Review CloudWatch Alarms**: AWS Console → CloudWatch → Alarms
4. **Escalation**: Create GitHub issue with error details

Remember: Always test in staging before production deployments!
