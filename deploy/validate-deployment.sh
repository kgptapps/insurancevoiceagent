#!/bin/bash

# Deployment Validation Script for Insurance Voice Agent
# This script validates that the deployment is working correctly

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

# Check if stack exists
check_stack_exists() {
    print_status "Checking if CloudFormation stack exists..."
    
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &> /dev/null; then
        print_success "CloudFormation stack found: $STACK_NAME"
        return 0
    else
        print_error "CloudFormation stack not found: $STACK_NAME"
        return 1
    fi
}

# Get stack outputs
get_stack_outputs() {
    print_status "Retrieving stack outputs..."
    
    CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    HTTP_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    WEBSOCKET_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='WebSocketApiUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    BUCKET_NAME=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$CLOUDFRONT_DOMAIN" ] && [ -n "$HTTP_API_URL" ] && [ -n "$LAMBDA_FUNCTION_NAME" ]; then
        print_success "Stack outputs retrieved successfully"
        echo "  CloudFront Domain: $CLOUDFRONT_DOMAIN"
        echo "  HTTP API URL: $HTTP_API_URL"
        echo "  WebSocket API URL: $WEBSOCKET_API_URL"
        echo "  Lambda Function: $LAMBDA_FUNCTION_NAME"
        echo "  S3 Bucket: $BUCKET_NAME"
        return 0
    else
        print_error "Failed to retrieve some stack outputs"
        return 1
    fi
}

# Test S3 bucket
test_s3_bucket() {
    print_status "Testing S3 bucket..."
    
    if [ -z "$BUCKET_NAME" ]; then
        print_error "S3 bucket name not found"
        return 1
    fi
    
    # Check if bucket exists and has files
    if aws s3 ls "s3://$BUCKET_NAME" --region "$AWS_REGION" &> /dev/null; then
        FILE_COUNT=$(aws s3 ls "s3://$BUCKET_NAME" --recursive --region "$AWS_REGION" | wc -l)
        if [ "$FILE_COUNT" -gt 0 ]; then
            print_success "S3 bucket has $FILE_COUNT files"
        else
            print_warning "S3 bucket exists but appears empty"
        fi
    else
        print_error "S3 bucket not accessible or doesn't exist"
        return 1
    fi
}

# Test CloudFront distribution
test_cloudfront() {
    print_status "Testing CloudFront distribution..."
    
    if [ -z "$CLOUDFRONT_DOMAIN" ]; then
        print_error "CloudFront domain not found"
        return 1
    fi
    
    # Test if CloudFront serves the frontend
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$CLOUDFRONT_DOMAIN" || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "CloudFront distribution is serving content (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "403" ]; then
        print_warning "CloudFront distribution exists but may still be deploying (HTTP $HTTP_CODE)"
    else
        print_error "CloudFront distribution not accessible (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test Lambda function
test_lambda() {
    print_status "Testing Lambda function..."
    
    if [ -z "$LAMBDA_FUNCTION_NAME" ]; then
        print_error "Lambda function name not found"
        return 1
    fi
    
    # Check if function exists
    if aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$AWS_REGION" &> /dev/null; then
        print_success "Lambda function exists and is accessible"
        
        # Get function info
        RUNTIME=$(aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$AWS_REGION" --query "Configuration.Runtime" --output text)
        MEMORY=$(aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$AWS_REGION" --query "Configuration.MemorySize" --output text)
        TIMEOUT=$(aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$AWS_REGION" --query "Configuration.Timeout" --output text)
        
        echo "  Runtime: $RUNTIME"
        echo "  Memory: ${MEMORY}MB"
        echo "  Timeout: ${TIMEOUT}s"
    else
        print_error "Lambda function not accessible"
        return 1
    fi
}

# Test HTTP API
test_http_api() {
    print_status "Testing HTTP API..."
    
    if [ -z "$HTTP_API_URL" ]; then
        print_error "HTTP API URL not found"
        return 1
    fi
    
    # Test health endpoint
    HEALTH_RESPONSE=$(curl -s "$HTTP_API_URL/api/health" || echo "")
    
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        print_success "HTTP API health check passed"
        echo "  Response: $HEALTH_RESPONSE"
    else
        print_error "HTTP API health check failed"
        echo "  Response: $HEALTH_RESPONSE"
        return 1
    fi
}

# Test OpenAI API key configuration
test_openai_config() {
    print_status "Testing OpenAI API key configuration..."
    
    PARAMETER_NAME="/$PROJECT_NAME/openai-api-key"
    
    if aws ssm get-parameter --name "$PARAMETER_NAME" --with-decryption --region "$AWS_REGION" &> /dev/null; then
        print_success "OpenAI API key is configured in Parameter Store"
    else
        print_warning "OpenAI API key not found in Parameter Store"
        echo "  Configure it with:"
        echo "  aws ssm put-parameter --name \"$PARAMETER_NAME\" --value \"your-key\" --type \"SecureString\" --overwrite"
        return 1
    fi
}

# Test WebSocket API (basic connectivity)
test_websocket_api() {
    print_status "Testing WebSocket API..."
    
    if [ -z "$WEBSOCKET_API_URL" ]; then
        print_error "WebSocket API URL not found"
        return 1
    fi
    
    # For now, just check if the URL is valid format
    if echo "$WEBSOCKET_API_URL" | grep -q "wss://"; then
        print_success "WebSocket API URL is properly formatted"
        echo "  URL: $WEBSOCKET_API_URL"
    else
        print_error "WebSocket API URL is not properly formatted"
        return 1
    fi
}

# Generate summary report
generate_summary() {
    echo ""
    echo "================================"
    echo "DEPLOYMENT VALIDATION SUMMARY"
    echo "================================"
    echo ""
    
    if [ "$OVERALL_STATUS" = "success" ]; then
        print_success "All tests passed! Your deployment is ready to use."
        echo ""
        echo "🌐 Frontend URL: https://$CLOUDFRONT_DOMAIN"
        echo "📊 API URL: $HTTP_API_URL"
        echo "🔌 WebSocket URL: $WEBSOCKET_API_URL"
        echo ""
        echo "Next steps:"
        echo "1. Visit the frontend URL to test the application"
        echo "2. Try the voice functionality"
        echo "3. Monitor Lambda logs for any issues"
    else
        print_warning "Some tests failed. Please review the issues above."
        echo ""
        echo "Common solutions:"
        echo "1. Wait 10-15 minutes for CloudFront to fully deploy"
        echo "2. Configure your OpenAI API key"
        echo "3. Check AWS CloudFormation console for any errors"
    fi
    
    echo ""
}

# Main validation function
main() {
    echo "Insurance Voice Agent - Deployment Validation"
    echo "============================================="
    echo ""
    
    OVERALL_STATUS="success"
    
    # Run all tests
    check_stack_exists || OVERALL_STATUS="failed"
    get_stack_outputs || OVERALL_STATUS="failed"
    test_s3_bucket || OVERALL_STATUS="failed"
    test_cloudfront || OVERALL_STATUS="failed"
    test_lambda || OVERALL_STATUS="failed"
    test_http_api || OVERALL_STATUS="failed"
    test_openai_config || OVERALL_STATUS="warning"
    test_websocket_api || OVERALL_STATUS="failed"
    
    # Generate summary
    generate_summary
}

# Run main function
main "$@"
