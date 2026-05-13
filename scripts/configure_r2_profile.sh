#!/bin/zsh

set -euo pipefail

echo "This creates an AWS CLI profile named 'r2' for Cloudflare R2."
echo "Your secret key is written only to ~/.aws/credentials by aws configure."
echo

DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib aws configure --profile r2
