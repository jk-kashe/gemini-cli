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

# Detect script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "${SCRIPT_DIR}/.." && pwd )"
CURRENT_DIR="$(pwd)"

# Ensure we are in the project root directory
if [ "${CURRENT_DIR}" != "${PROJECT_ROOT}" ]; then
  echo "⚠️  You are running this script from: ${CURRENT_DIR}"
  echo "➡️  Automatically switching to project root: ${PROJECT_ROOT}"
  cd "${PROJECT_ROOT}"
fi

# Function to extract values from terraform.tfvars
get_tfvar() {
  local key=$1
  local tfvars_file="terraform/terraform.tfvars"
  # Fallback to example if actual tfvars doesn't exist
  if [ ! -f "$tfvars_file" ]; then
    tfvars_file="terraform/terraform.tfvars.example"
  fi
  
  if [ -f "$tfvars_file" ]; then
    grep "^${key}[[:space:]]*=" "$tfvars_file" | awk -F'=' '{print $2}' | tr -d ' "'
  fi
}

# Configuration Discovery
TF_PROJECT_ID=$(get_tfvar "project_id")
TF_REGION=$(get_tfvar "region")
TF_SERVICE_NAME=$(get_tfvar "service_name")
TF_REPOSITORY_NAME=$(get_tfvar "repository_name")

PROJECT_ID=${TF_PROJECT_ID:-${PROJECT_ID:-$(gcloud config get-value project)}}
REGION=${TF_REGION:-${REGION:-us-central1}}
SERVICE_NAME=${TF_SERVICE_NAME:-${SERVICE_NAME:-gemini-cli-web}}
REPOSITORY_NAME=${TF_REPOSITORY_NAME:-${REPOSITORY_NAME:-gemini-cli-repo}}
BUCKET_NAME=${BUCKET_NAME:-${PROJECT_ID}-gemini-workspace}
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY_NAME}/${SERVICE_NAME}:latest"

echo "----------------------------------------------------------"
echo "🚀 Web Terminal Deployment Configuration"
echo "----------------------------------------------------------"
echo "Project ID:      ${PROJECT_ID}"
echo "Region:          ${REGION}"
echo "Service Name:    ${SERVICE_NAME}"
echo "Repository:      ${REPOSITORY_NAME}"
echo "Bucket Name:     ${BUCKET_NAME}"
echo "Image Tag:       ${IMAGE_TAG}"
echo "----------------------------------------------------------"

# 1. Create GCS bucket if it doesn't exist
if ! gsutil ls -b "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "📦 Creating bucket gs://${BUCKET_NAME}..."
  gsutil mb -l "${REGION}" "gs://${BUCKET_NAME}"
else
  echo "✅ Bucket gs://${BUCKET_NAME} already exists."
fi

# 2. Build and push Docker image
echo "🛠️  Building and pushing Docker image..."
gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE_TAG="${IMAGE_TAG}" .

# 3. Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_TAG}" \
  --region "${REGION}" \
  --execution-environment gen2 \
  --update-env-vars="WORKSPACE_DIR=/mnt/gcs-workspace" \
  --add-volume="name=gcs-workspace,type=cloud-storage,bucket=${BUCKET_NAME}" \
  --add-volume-mount="volume=gcs-workspace,mount-path=/mnt/gcs-workspace" \
  --session-affinity

echo "----------------------------------------------------------"
echo "🎉 Deployment complete!"
echo "Service URL:"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)'
echo "----------------------------------------------------------"
