#!/usr/bin/env bash
set -euo pipefail

##
## Lamdis License Validator
## Decodes and displays license.jwt metadata (does NOT verify signature).
##

LICENSE_FILE="${1:-license.jwt}"

if [ ! -f "$LICENSE_FILE" ]; then
  echo "Error: License file not found: $LICENSE_FILE"
  echo "Usage: $0 [path/to/license.jwt]"
  exit 1
fi

# JWT is three base64url-encoded parts separated by dots
PAYLOAD=$(cut -d'.' -f2 < "$LICENSE_FILE")

# Pad base64url to base64
PADDED=$(echo "$PAYLOAD" | tr '_-' '/+')
MOD=$((${#PADDED} % 4))
if [ "$MOD" -eq 2 ]; then PADDED="${PADDED}=="; fi
if [ "$MOD" -eq 3 ]; then PADDED="${PADDED}="; fi

# Decode
if command -v python3 &>/dev/null; then
  DECODED=$(echo "$PADDED" | python3 -m base64 -d 2>/dev/null || echo "$PADDED" | base64 -d 2>/dev/null)
elif command -v base64 &>/dev/null; then
  DECODED=$(echo "$PADDED" | base64 -d 2>/dev/null || echo "$PADDED" | base64 --decode 2>/dev/null)
else
  echo "Error: base64 decoder not found. Install python3 or base64."
  exit 1
fi

echo "Lamdis License Info"
echo "==================="
echo ""

if command -v jq &>/dev/null; then
  echo "$DECODED" | jq '.'

  # Show expiry info
  EXP=$(echo "$DECODED" | jq -r '.exp // empty')
  if [ -n "$EXP" ]; then
    NOW=$(date +%s)
    DAYS_LEFT=$(( (EXP - NOW) / 86400 ))
    EXP_DATE=$(date -d "@$EXP" 2>/dev/null || date -r "$EXP" 2>/dev/null || echo "unknown")
    echo ""
    if [ "$DAYS_LEFT" -lt 0 ]; then
      echo "⚠ License EXPIRED $(( -DAYS_LEFT )) days ago ($EXP_DATE)"
    elif [ "$DAYS_LEFT" -lt 30 ]; then
      echo "⚠ License expires in $DAYS_LEFT days ($EXP_DATE)"
    else
      echo "License valid for $DAYS_LEFT days (expires $EXP_DATE)"
    fi
  fi
else
  echo "$DECODED"
  echo ""
  echo "(Install jq for formatted output)"
fi

echo ""
echo "Note: This script only decodes the license payload."
echo "Signature verification happens at runtime by the Lamdis API."
