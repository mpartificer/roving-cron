#!/bin/bash
set -e

# Configuration
FUNCTION_NAME="SupabaseEventScanner"
REGION="us-east-1"  # Change to your AWS region
S3_BUCKET="your-deployment-bucket"  # Change to your S3 bucket name

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null
then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting deployment process...${NC}"

# Step 1: Create package directory
echo -e "${YELLOW}Step 1: Creating package...${NC}"
mkdir -p dist
rm -rf dist/*

# Step 2: Install production dependencies
echo -e "${YELLOW}Step 2: Installing production dependencies...${NC}"
npm ci --production --quiet

# Step 3: Copy source files
echo -e "${YELLOW}Step 3: Copying source files...${NC}"
cp -r src/* dist/
cp package.json dist/

# Step 4: Create zip file
echo -e "${YELLOW}Step 4: Creating deployment package...${NC}"
cd dist
zip -q -r ../function.zip .
cd ..

# Step 5: Check if function exists
echo -e "${YELLOW}Step 5: Checking if function exists...${NC}"
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION &> /dev/null; then
    # Update existing function
    echo -e "${YELLOW}Updating existing Lambda function...${NC}"
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --region $REGION \
        --publish
else
    # Create new function
    echo -e "${YELLOW}Creating new Lambda function...${NC}"
    
    # Create role if it doesn't exist
    ROLE_NAME="lambda-supabase-event-scanner-role"
    
    if ! aws iam get-role --role-name $ROLE_NAME &> /dev/null; then
        echo -e "${YELLOW}Creating IAM role...${NC}"
        aws iam create-role \
            --role-name $ROLE_NAME \
            --assume-role-policy-document '{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "lambda.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }'
        
        # Attach basic execution policy
        aws iam attach-role-policy \
            --role-name $ROLE_NAME \
            --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
            
        # Wait for role to propagate
        echo -e "${YELLOW}Waiting for IAM role to propagate...${NC}"
        sleep 10
    fi
    
    # Get role ARN
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
    
    # Create the Lambda function
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --handler index.handler \
        --runtime nodejs18.x \
        --role $ROLE_ARN \
        --timeout 30 \
        --region $REGION \
        --environment "Variables={SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY}"
        
    # Create EventBridge rule
    echo -e "${YELLOW}Creating EventBridge rule...${NC}"
    RULE_NAME="DailySupabaseEventScan"
    
    aws events put-rule \
        --name $RULE_NAME \
        --schedule-expression "cron(0 6 * * ? *)" \
        --state ENABLED \
        --region $REGION
        
    # Add permission for EventBridge to invoke Lambda
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id $RULE_NAME \
        --action 'lambda:InvokeFunction' \
        --principal events.amazonaws.com \
        --source-arn $(aws events describe-rule --name $RULE_NAME --region $REGION --query 'Arn' --output text) \
        --region $REGION
        
    # Set Lambda as target for the rule
    aws events put-targets \
        --rule $RULE_NAME \
        --targets "Id"="1","Arn"="$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)" \
        --region $REGION
fi

# Clean up
echo -e "${YELLOW}Cleaning up...${NC}"
rm -rf dist
rm function.zip

echo -e "${GREEN}Deployment completed successfully!${NC}"