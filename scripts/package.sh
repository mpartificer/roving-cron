#!/bin/bash
set -e

CURRENT_DIR=$(pwd)
echo "Current directory: $CURRENT_DIR"

echo "Creating deployment package for Lambda function..."

# Create temp directory for packaging
TEMP_DIR=$(mktemp -d)
echo "Using temporary directory: $TEMP_DIR"

# Debugging: List contents of current directory
echo "Contents of current directory:"
ls -la

# Copy source files - Use the correct paths for your structure
echo "Copying source files..."
cp -r scripts/src/* $TEMP_DIR/ || echo "Failed to copy source files"

# Find and copy package.json (it could be in the root or in scripts folder)
if [ -f "package.json" ]; then
    cp package.json $TEMP_DIR/
    echo "Copied package.json from root directory"
elif [ -f "scripts/package.json" ]; then
    cp scripts/package.json $TEMP_DIR/
    echo "Copied package.json from scripts directory"
else
    # Create a minimal package.json if none exists
    echo "No package.json found, creating a minimal one"
    cat > $TEMP_DIR/package.json << 'EOF'
{
  "name": "supabase-event-scanner",
  "version": "1.0.0",
  "description": "Lambda function to scan Supabase events",
  "main": "index.js",
  "dependencies": {
    "@supabase/supabase-js": "^2.33.1",
    "stripe": "^12.18.0"
  }
}
EOF
fi

# Check if package.json was successfully copied or created
if [ -f "$TEMP_DIR/package.json" ]; then
    echo "package.json exists in $TEMP_DIR:"
    cat $TEMP_DIR/package.json
else
    echo "ERROR: Failed to create package.json"
    exit 1
fi

# Install production dependencies
echo "Installing production dependencies..."
cd $TEMP_DIR
npm install --production --quiet
cd "$CURRENT_DIR"

# Create zip file
echo "Creating zip file..."
OUTPUT_FILE="$CURRENT_DIR/function.zip"
cd $TEMP_DIR
zip -r "$OUTPUT_FILE" .
cd "$CURRENT_DIR"

# Verify the zip was created
if [ -f "$OUTPUT_FILE" ]; then
    echo "ZIP file created successfully at: $OUTPUT_FILE"
else
    echo "ERROR: ZIP file creation failed"
    exit 1
fi

# Clean up
echo "Cleaning up temporary directory..."
rm -rf $TEMP_DIR

# Get zip file size
SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "Package created successfully: $OUTPUT_FILE ($SIZE)"

# Output the absolute path for use in other scripts
echo "$OUTPUT_FILE"