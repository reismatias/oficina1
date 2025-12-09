#!/bin/bash

BASE_URL="http://localhost:3333"
DEVICE_ID="test_device_auto"
COOKIE_FILE="cookies.txt"

# 1. Login to get session
echo "Logging in..."
curl -s -c $COOKIE_FILE -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123"}' > /dev/null

# 2. Set Threshold to 50
echo "Setting threshold to 50..."
curl -s -b $COOKIE_FILE -X POST "$BASE_URL/api/devices/$DEVICE_ID/threshold" \
  -H "Content-Type: application/json" \
  -d '{"threshold": 50}' | grep "Threshold definido"

# 3. Ensure LED is OFF initially
echo "Turning LED OFF..."
curl -s -b $COOKIE_FILE -X POST "$BASE_URL/api/devices/$DEVICE_ID/led" \
  -H "Content-Type: application/json" \
  -d '{"state": false}' > /dev/null

# 4. Send Data with dB = 40 (Below Threshold)
echo "Sending dB=40..."
curl -s -X POST "$BASE_URL/dados" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\", \"db\": 40}" > /dev/null

# 5. Check LED State (Should be OFF)
echo "Checking LED state (Expect false)..."
curl -s -b $COOKIE_FILE "$BASE_URL/api/devices/$DEVICE_ID/led"

# 6. Send Data with dB = 60 (Above Threshold)
echo "Sending dB=60..."
curl -s -X POST "$BASE_URL/dados" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\": \"$DEVICE_ID\", \"db\": 60}" > /dev/null

# 7. Check LED State (Should be ON)
echo "Checking LED state (Expect true)..."
curl -s -b $COOKIE_FILE "$BASE_URL/api/devices/$DEVICE_ID/led"

# Cleanup
rm $COOKIE_FILE
