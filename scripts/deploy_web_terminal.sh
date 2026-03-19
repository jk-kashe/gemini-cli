#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION=${REGION:-us-central1}
SERVICE_NAME=${SERVICE_NAME:-gemini-cli-web}
BUCKET_NAME=${BUCKET_NAME:-${PROJECT_ID}-gemini-workspace}
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Using Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service Name: ${SERVICE_NAME}"
echo "Bucket Name: ${BUCKET_NAME}"

# 1. Create GCS bucket if it doesn't exist
if ! gsutil ls -b "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "Creating bucket gs://${BUCKET_NAME}..."
  gsutil mb -l "${REGION}" "gs://${BUCKET_NAME}"
else
  echo "Bucket gs://${BUCKET_NAME} already exists."
fi

# 2. Build and push Docker image
echo "Building and pushing Docker image ${IMAGE_TAG}..."
gcloud builds submit --tag "${IMAGE_TAG}" --file Dockerfile.web-terminal .

# 3. Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_TAG}" \
  --region "${REGION}" \
  --execution-environment gen2 \
  --allow-unauthenticated \
  --update-env-vars="WORKSPACE_DIR=/mnt/gcs-workspace" \
  --add-volume="name=gcs-workspace,type=cloud-storage,bucket=${BUCKET_NAME}" \
  --add-volume-mount="volume=gcs-workspace,mount-path=/mnt/gcs-workspace" \
  --session-affinity

echo "Deployment complete!"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)'
