#!/bin/bash
set -e

# Parse arguments
ENV=$1
if [[ -z "$ENV" ]]; then
  echo "Error: Environment not specified"
  echo "Usage: $0 <environment> [version]"
  echo "Example: $0 staging v1.0.0"
  exit 1
fi

VERSION=$2
if [[ -z "$VERSION" ]]; then
  VERSION="latest"
  echo "No version specified, using latest"
fi

# Configuration for different environments
case "$ENV" in
  "dev")
    STACK_NAME="dev-supabase-event-scanner"
    LAMBDA_NAME="DevSupabaseEventScanner"
    SECRETS_PREFIX="/dev/supabase/"
    ;;
  "staging")
    STACK_NAME="staging-supabase-event-scanner"
    LAMBDA_NAME="StagingSupabaseEventScanner"
    SECRETS_PREFIX="/staging/supabase/"
    ;;
  "prod")
    STACK_NAME="prod-supabase-event-scanner"
    LAMBDA_NAME="ProdSupabaseEventScanner"
    SECRETS_PREFIX="/prod/supabase/"
    ;;
  *)
    echo "Error: Unknown environment '$ENV'"
    echo "Valid environments: dev, staging, prod"
    exit 1
    ;;
esac

echo "Deploying to $ENV environment..."

# Get Supabase credentials from AWS Parameter Store
SUPABASE_URL=$(aws ssm get-parameter --name "${SECRETS_PREFIX}url" --with-decryption --query "Parameter.Value" --output text)
SUPABASE_KEY=$(aws ssm get-parameter --name "${SECRETS_PREFIX}service-role-key" --with-decryption --query "Parameter.Value" --output text)

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_KEY" ]]; then
  echo "Error: Could not retrieve Supabase credentials from Parameter Store"
  exit 1
fi

# Get S3 bucket from Parameter Store
DEPLOYMENT_BUCKET=$(aws ssm get-parameter --name "DeploymentBucket" --query "Parameter.Value" --output text)

if [[ -z "$DEPLOYMENT_BUCKET" ]]; then
  echo "Error: Could not retrieve deployment bucket from Parameter Store"
  exit 1
fi

# Set the S3 key based on version
if [[ "$VERSION" == "latest" ]]; then
  S3_KEY="lambda/supabase-event-scanner-latest.zip"
else
  S3_KEY="lambda/supabase-event-scanner-${VERSION}.zip"
fi

# Check if the file exists in S3
if ! aws s3 ls "s3://${DEPLOYMENT_BUCKET}/${S3_KEY}" &> /dev/null; then
  echo "Error: File s3://${DEPLOYMENT_BUCKET}/${S3_KEY} does not exist"
  exit 1
fi

echo "Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file infrastructure/cloudformation.yaml \
  --stack-name $STACK_NAME \
  --parameter-overrides \
    SupabaseUrl=$SUPABASE_URL \
    SupabaseServiceRoleKey=$SUPABASE_KEY \
    LambdaFunctionName=$LAMBDA_NAME \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

echo "Updating Lambda code..."
aws lambda update-function-code \
  --function-name $LAMBDA_NAME \
  --s3-bucket $DEPLOYMENT_BUCKET \
  --s3-key $S3_KEY \
  --publish

echo "Deployment to $ENV completed successfully!"