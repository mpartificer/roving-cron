#!/bin/bash
set -e

# Check if semver is installed
if ! command -v semver &> /dev/null; then
  echo "semver is not installed. Installing..."
  npm install -g semver
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Determine release type
echo "Select release type:"
echo "1) Patch (bug fixes)"
echo "2) Minor (new features, backwards compatible)"
echo "3) Major (breaking changes)"
echo "4) Custom version"
read -p "Enter choice [1-4]: " RELEASE_TYPE

case $RELEASE_TYPE in
  1)
    NEW_VERSION=$(semver -i patch $CURRENT_VERSION)
    ;;
  2)
    NEW_VERSION=$(semver -i minor $CURRENT_VERSION)
    ;;
  3)
    NEW_VERSION=$(semver -i major $CURRENT_VERSION)
    ;;
  4)
    read -p "Enter custom version (x.y.z format): " NEW_VERSION
    if ! semver $NEW_VERSION &> /dev/null; then
      echo "Error: Invalid version format"
      exit 1
    fi
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo "New version will be: $NEW_VERSION"
read -p "Continue? (y/n): " CONFIRM

if [[ "$CONFIRM" != "y" ]]; then
  echo "Release cancelled"
  exit 0
fi

# Update version in package.json
tmp=$(mktemp)
jq ".version = \"$NEW_VERSION\"" package.json > "$tmp" && mv "$tmp" package.json

# Create a new git tag
echo "Creating git tag v$NEW_VERSION..."
git add package.json
git commit -m "Bump version to $NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push changes
echo "Pushing changes and tags..."
git push origin main
git push origin "v$NEW_VERSION"

echo "Release v$NEW_VERSION created and pushed!"
echo "GitHub Actions workflow will build and deploy the release."