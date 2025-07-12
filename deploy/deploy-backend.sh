#!/bin/bash

# Backend Deployment Script for Insurance Voice Agent
# This script builds and deploys the Express.js backend to AWS Lambda

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

# Check if infrastructure exists
check_infrastructure() {
    print_status "Checking if infrastructure stack exists..."
    
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
        print_success "Infrastructure stack found"
        return 0
    else
        print_error "Infrastructure stack not found. Please run deploy-frontend.sh first."
        exit 1
    fi
}

# Get stack outputs
get_stack_outputs() {
    print_status "Retrieving stack outputs..."
    
    LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue" \
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
    echo "  Lambda Function: $LAMBDA_FUNCTION_NAME"
    echo "  HTTP API URL: $HTTP_API_URL"
    echo "  WebSocket API URL: $WEBSOCKET_API_URL"
}

# Install dependencies
install_dependencies() {
    print_status "Installing backend dependencies..."
    
    cd backend
    
    # Install production dependencies
    npm ci --only=production
    
    if [ $? -eq 0 ]; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
    
    cd ..
}

# Create deployment package
create_deployment_package() {
    print_status "Creating deployment package..."
    
    cd backend
    
    # Remove any existing deployment package
    rm -f lambda-deployment.zip
    
    # Create zip file with source code and dependencies
    zip -r lambda-deployment.zip \
        src/ \
        node_modules/ \
        package.json \
        -x "node_modules/.cache/*" \
        -x "*.log" \
        -x ".env*" \
        -x "*.test.js" \
        -x "test/*"
    
    if [ $? -eq 0 ]; then
        print_success "Deployment package created: lambda-deployment.zip"
        
        # Show package size
        PACKAGE_SIZE=$(du -h lambda-deployment.zip | cut -f1)
        echo "  Package size: $PACKAGE_SIZE"
    else
        print_error "Failed to create deployment package"
        exit 1
    fi
    
    cd ..
}

# Deploy to Lambda
deploy_to_lambda() {
    print_status "Deploying to Lambda function: $LAMBDA_FUNCTION_NAME"
    
    aws lambda update-function-code \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --zip-file fileb://backend/lambda-deployment.zip \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_success "Lambda function code updated successfully"
    else
        print_error "Failed to update Lambda function code"
        exit 1
    fi
    
    # Update function configuration
    print_status "Updating Lambda function configuration..."
    
    aws lambda update-function-configuration \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --handler "src/lambda.handler" \
        --runtime "nodejs22.x" \
        --timeout 30 \
        --memory-size 512 \
        --environment Variables="{
            NODE_ENV=$ENVIRONMENT,
            PROJECT_NAME=$PROJECT_NAME,
            PARAMETER_PREFIX=/$PROJECT_NAME,
            AWS_REGION=$AWS_REGION
        }" \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_success "Lambda function configuration updated"
    else
        print_warning "Lambda function configuration update failed (non-critical)"
    fi
}

# Test Lambda function
test_lambda_function() {
    print_status "Testing Lambda function..."
    
    # Create a test event
    cat > /tmp/test-event.json << EOF
{
    "httpMethod": "GET",
    "path": "/api/health",
    "headers": {
        "Content-Type": "application/json"
    },
    "body": null,
    "isBase64Encoded": false
}
EOF
    
    # Invoke the function
    aws lambda invoke \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --payload file:///tmp/test-event.json \
        --region "$AWS_REGION" \
        /tmp/lambda-response.json
    
    if [ $? -eq 0 ]; then
        print_success "Lambda function test completed"
        
        # Show response
        echo "Response:"
        cat /tmp/lambda-response.json | jq '.' 2>/dev/null || cat /tmp/lambda-response.json
        
        # Cleanup
        rm -f /tmp/test-event.json /tmp/lambda-response.json
    else
        print_warning "Lambda function test failed (check logs for details)"
    fi
}

# Configure OpenAI API key
configure_openai_key() {
    print_status "Checking OpenAI API key configuration..."
    
    PARAMETER_NAME="/$PROJECT_NAME/openai-api-key"
    
    # Check if parameter exists
    if aws ssm get-parameter --name "$PARAMETER_NAME" --region "$AWS_REGION" &> /dev/null; then
        print_success "OpenAI API key parameter already exists"
    else
        print_warning "OpenAI API key parameter not found"
        echo ""
        echo "To configure your OpenAI API key, run:"
        echo "aws ssm put-parameter \\"
        echo "    --name \"$PARAMETER_NAME\" \\"
        echo "    --value \"your-openai-api-key-here\" \\"
        echo "    --type \"SecureString\" \\"
        echo "    --overwrite"
        echo ""
    fi
}

# Cleanup deployment artifacts
cleanup() {
    print_status "Cleaning up deployment artifacts..."
    
    rm -f backend/lambda-deployment.zip
    
    print_success "Cleanup completed"
}

# Main deployment function
main() {
    print_status "Starting backend deployment for $PROJECT_NAME ($ENVIRONMENT)"
    
    # Pre-flight checks
    check_aws_cli
    check_node
    check_infrastructure
    
    # Get infrastructure outputs
    get_stack_outputs
    
    # Build and deploy
    install_dependencies
    create_deployment_package
    deploy_to_lambda
    test_lambda_function
    
    # Configuration
    configure_openai_key
    
    # Cleanup
    cleanup
    
    print_success "Backend deployment completed!"
    echo ""
    echo "🚀 Your backend is deployed and running on AWS Lambda!"
    echo ""
    echo "📊 API Endpoints:"
    echo "   HTTP API: $HTTP_API_URL"
    echo "   WebSocket: $WEBSOCKET_API_URL"
    echo ""
    echo "🔧 Lambda Function: $LAMBDA_FUNCTION_NAME"
    echo ""
    echo "⚠️  Note: Make sure to configure your OpenAI API key if not already done."
    echo ""
    echo "🔍 To view logs:"
    echo "   aws logs tail /aws/lambda/$LAMBDA_FUNCTION_NAME --follow"
}

# Run main function
main "$@"
