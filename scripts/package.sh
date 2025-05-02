#!/bin/bash
set -e

echo "Creating deployment package for Lambda function..."

# Create temp directory for packaging
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Copy source files
echo "Copying source files..."
cp -r src/* $TEMP_DIR/
cp package.json $TEMP_DIR/

# Install production dependencies
echo "Installing production dependencies..."
cd $TEMP_DIR
npm ci --production --quiet
cd - > /dev/null

# Create zip file
echo "Creating zip file..."
OUTPUT_FILE="function.zip"
cd $TEMP_DIR
zip -r ../$OUTPUT_FILE .
cd - > /dev/null

# Clean up
echo "Cleaning up temporary directory..."
rm -rf $TEMP_DIR

# Get zip file size
SIZE=$(du -h $OUTPUT_FILE | cut -f1)
echo "Package created successfully: $OUTPUT_FILE ($SIZE)"

# Output file path for use in other scripts
echo "$OUTPUT_FILE"