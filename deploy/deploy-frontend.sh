#!/bin/bash

# Frontend Deployment Script for Insurance Voice Agent
# This script builds and deploys the React frontend to S3 and CloudFront

set -e  # Exit on any error

# Configuration
PROJECT_NAME="insurance-voice-agent"
ENVIRONMENT="${ENVIRONMENT:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${PROJECT_NAME}-infrastructure-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "AWS CLI is configured and ready"
}

# Check if Node.js and npm are installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    print_success "Node.js and npm are available"
}

# Deploy CloudFormation stack
deploy_infrastructure() {
    print_status "Deploying AWS infrastructure..."

    # Check if stack exists and is in ROLLBACK_COMPLETE state
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].StackStatus" \
        --output text 2>/dev/null || echo "DOES_NOT_EXIST")

    if [ "$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
        print_warning "Stack is in ROLLBACK_COMPLETE state. Deleting and recreating..."
        aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION"
        print_status "Waiting for stack deletion to complete..."
        aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$AWS_REGION"
        print_success "Stack deleted successfully"
    fi

    aws cloudformation deploy \
        --template-file deploy/aws-infrastructure.yml \
        --stack-name "$STACK_NAME" \
        --parameter-overrides \
            ProjectName="$PROJECT_NAME" \
            Environment="$ENVIRONMENT" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION"

    if [ $? -eq 0 ]; then
        print_success "Infrastructure deployed successfully"
    else
        print_error "Infrastructure deployment failed"
        exit 1
    fi
}

# Get stack outputs
get_stack_outputs() {
    print_status "Retrieving stack outputs..."
    
    BUCKET_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
        --output text)
    
    CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
        --output text)
    
    CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
        --output text)
    
    HTTP_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" \
        --output text)
    
    WEBSOCKET_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='WebSocketApiUrl'].OutputValue" \
        --output text)
    
    print_success "Retrieved stack outputs"
    echo "  Bucket: $BUCKET_NAME"
    echo "  CloudFront ID: $CLOUDFRONT_ID"
    echo "  CloudFront Domain: $CLOUDFRONT_DOMAIN"
    echo "  HTTP API URL: $HTTP_API_URL"
    echo "  WebSocket API URL: $WEBSOCKET_API_URL"
}

# Create production environment file
create_env_file() {
    print_status "Creating production environment configuration..."
    
    cat > frontend/.env.production << EOF
# Production Environment Configuration
REACT_APP_API_URL=$HTTP_API_URL
REACT_APP_WS_URL=$WEBSOCKET_API_URL
REACT_APP_ENVIRONMENT=$ENVIRONMENT
GENERATE_SOURCEMAP=false
EOF
    
    print_success "Created frontend/.env.production"
}

# Build React application
build_frontend() {
    print_status "Building React frontend..."
    
    cd frontend
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm ci
    fi
    
    # Build the application
    npm run build
    
    if [ $? -eq 0 ]; then
        print_success "Frontend build completed"
    else
        print_error "Frontend build failed"
        exit 1
    fi
    
    cd ..
}

# Configure S3 bucket policy
configure_bucket_policy() {
    print_status "Configuring S3 bucket policy..."

    cat > /tmp/bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
        }
    ]
}
EOF

    aws s3api put-bucket-policy \
        --bucket "$BUCKET_NAME" \
        --policy file:///tmp/bucket-policy.json \
        --region "$AWS_REGION"

    if [ $? -eq 0 ]; then
        print_success "S3 bucket policy configured"
    else
        print_warning "S3 bucket policy configuration failed (non-critical)"
    fi

    # Cleanup
    rm -f /tmp/bucket-policy.json
}

# Deploy to S3
deploy_to_s3() {
    print_status "Deploying frontend to S3..."

    aws s3 sync frontend/build/ "s3://$BUCKET_NAME" \
        --delete \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=31536000" \
        --exclude "*.html" \
        --exclude "service-worker.js"

    # Deploy HTML files with shorter cache
    aws s3 sync frontend/build/ "s3://$BUCKET_NAME" \
        --delete \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=0, must-revalidate" \
        --include "*.html" \
        --include "service-worker.js"

    if [ $? -eq 0 ]; then
        print_success "Frontend deployed to S3"
    else
        print_error "S3 deployment failed"
        exit 1
    fi
}

# Invalidate CloudFront cache
invalidate_cloudfront() {
    print_status "Invalidating CloudFront cache..."
    
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_ID" \
        --paths "/*" \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_success "CloudFront invalidation created"
    else
        print_warning "CloudFront invalidation failed (non-critical)"
    fi
}

# Main deployment function
main() {
    print_status "Starting frontend deployment for $PROJECT_NAME ($ENVIRONMENT)"
    
    # Pre-flight checks
    check_aws_cli
    check_node
    
    # Deploy infrastructure
    deploy_infrastructure
    
    # Get outputs and create environment
    get_stack_outputs
    create_env_file
    
    # Build and deploy frontend
    build_frontend
    configure_bucket_policy
    deploy_to_s3
    invalidate_cloudfront
    
    print_success "Frontend deployment completed!"
    echo ""
    echo "🌐 Your application is available at:"
    echo "   https://$CLOUDFRONT_DOMAIN"
    echo ""
    echo "📊 API Endpoints:"
    echo "   HTTP API: $HTTP_API_URL"
    echo "   WebSocket: $WEBSOCKET_API_URL"
    echo ""
    echo "⚠️  Note: CloudFront distribution may take 10-15 minutes to fully propagate."
}

# Run main function
main "$@"
