#!/bin/bash

# Complete Deployment Script for Insurance Voice Agent
# This script deploys both frontend and backend to AWS

set -e  # Exit on any error

# Configuration
PROJECT_NAME="insurance-voice-agent"
ENVIRONMENT="${ENVIRONMENT:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}================================${NC}"
}

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

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    print_success "All prerequisites met"
    
    # Show configuration
    echo ""
    echo "Deployment Configuration:"
    echo "  Project: $PROJECT_NAME"
    echo "  Environment: $ENVIRONMENT"
    echo "  AWS Region: $AWS_REGION"
    echo "  OpenAI Key: ${OPENAI_API_KEY:+[SET]}${OPENAI_API_KEY:-[NOT SET]}"
    echo ""
}

# Deploy frontend
deploy_frontend() {
    print_header "Deploying Frontend"
    
    if [ -f "deploy/deploy-frontend.sh" ]; then
        ./deploy/deploy-frontend.sh
    else
        print_error "Frontend deployment script not found"
        exit 1
    fi
}

# Deploy backend
deploy_backend() {
    print_header "Deploying Backend"
    
    if [ -f "deploy/deploy-backend.sh" ]; then
        ./deploy/deploy-backend.sh
    else
        print_error "Backend deployment script not found"
        exit 1
    fi
}

# Configure OpenAI API key
configure_openai_key() {
    print_header "Configuring OpenAI API Key"
    
    PARAMETER_NAME="/$PROJECT_NAME/openai-api-key"
    
    if [ -n "$OPENAI_API_KEY" ]; then
        print_status "Setting OpenAI API key in AWS Systems Manager..."
        
        aws ssm put-parameter \
            --name "$PARAMETER_NAME" \
            --value "$OPENAI_API_KEY" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION"
        
        if [ $? -eq 0 ]; then
            print_success "OpenAI API key configured successfully"
        else
            print_error "Failed to configure OpenAI API key"
            exit 1
        fi
    else
        print_warning "OpenAI API key not provided"
        echo ""
        echo "To configure your OpenAI API key later, run:"
        echo "aws ssm put-parameter \\"
        echo "    --name \"$PARAMETER_NAME\" \\"
        echo "    --value \"your-openai-api-key-here\" \\"
        echo "    --type \"SecureString\" \\"
        echo "    --overwrite"
        echo ""
    fi
}

# Test deployment
test_deployment() {
    print_header "Testing Deployment"
    
    STACK_NAME="${PROJECT_NAME}-infrastructure-${ENVIRONMENT}"
    
    # Get URLs from CloudFormation
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
    
    # Test frontend
    print_status "Testing frontend..."
    if curl -s -o /dev/null -w "%{http_code}" "https://$CLOUDFRONT_DOMAIN" | grep -q "200"; then
        print_success "Frontend is accessible"
    else
        print_warning "Frontend test failed (may take time to propagate)"
    fi
    
    # Test backend health endpoint
    print_status "Testing backend health endpoint..."
    if curl -s "$HTTP_API_URL/api/health" | grep -q "ok"; then
        print_success "Backend health check passed"
    else
        print_warning "Backend health check failed"
    fi
}

# Show final information
show_final_info() {
    print_header "Deployment Complete!"
    
    STACK_NAME="${PROJECT_NAME}-infrastructure-${ENVIRONMENT}"
    
    # Get all outputs
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
    
    LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue" \
        --output text)
    
    echo ""
    echo "🎉 Your Insurance Voice Agent is now deployed to AWS!"
    echo ""
    echo "🌐 Frontend URL:"
    echo "   https://$CLOUDFRONT_DOMAIN"
    echo ""
    echo "📊 API Endpoints:"
    echo "   HTTP API: $HTTP_API_URL"
    echo "   WebSocket: $WEBSOCKET_API_URL"
    echo ""
    echo "🔧 AWS Resources:"
    echo "   Lambda Function: $LAMBDA_FUNCTION_NAME"
    echo "   CloudFormation Stack: $STACK_NAME"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Visit your frontend URL to test the application"
    echo "   2. Check that voice functionality works end-to-end"
    echo "   3. Monitor Lambda logs for any issues"
    echo ""
    echo "🔍 Useful Commands:"
    echo "   # View Lambda logs"
    echo "   aws logs tail /aws/lambda/$LAMBDA_FUNCTION_NAME --follow"
    echo ""
    echo "   # Update OpenAI API key"
    echo "   aws ssm put-parameter --name \"/$PROJECT_NAME/openai-api-key\" --value \"new-key\" --type \"SecureString\" --overwrite"
    echo ""
    echo "   # Redeploy frontend"
    echo "   ./deploy/deploy-frontend.sh"
    echo ""
    echo "   # Redeploy backend"
    echo "   ./deploy/deploy-backend.sh"
    echo ""
    echo "⚠️  Note: CloudFront distribution may take 10-15 minutes to fully propagate."
    echo ""
}

# Main deployment function
main() {
    echo ""
    print_header "Insurance Voice Agent - AWS Deployment"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Deploy components
    deploy_frontend
    deploy_backend
    
    # Configure API key
    configure_openai_key
    
    # Test deployment
    test_deployment
    
    # Show final information
    show_final_info
}

# Handle script arguments
case "${1:-}" in
    "frontend")
        print_header "Deploying Frontend Only"
        check_prerequisites
        deploy_frontend
        ;;
    "backend")
        print_header "Deploying Backend Only"
        check_prerequisites
        deploy_backend
        ;;
    "test")
        print_header "Testing Deployment"
        test_deployment
        ;;
    *)
        main "$@"
        ;;
esac
