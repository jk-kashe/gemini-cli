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

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable required APIs
resource "google_project_service" "cloud_run" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  service = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

# 2. Artifact Registry for the Docker image
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "gemini-cli-repo"
  description   = "Docker repository for Gemini CLI Web Terminal"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

# 3. GCS Bucket for the workspace
resource "google_storage_bucket" "workspace" {
  name          = "${var.project_id}-gemini-workspace"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
}

# 4. Service Account for Cloud Run
resource "google_service_account" "gemini_runner" {
  account_id   = "gemini-cli-runner"
  display_name = "Gemini CLI Runner Service Account"
}

# 5. IAM Permissions for Service Account
resource "google_storage_bucket_iam_member" "workspace_admin" {
  bucket = google_storage_bucket.workspace.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.gemini_runner.email}"
}

# 6. Cloud Run Service (Experimental)
# Note: Initial deployment might fail if the image doesn't exist yet.
# In a real MVP, you'd build and push the image before applying this part,
# or use a placeholder image initially.
resource "google_cloud_run_v2_service" "web_terminal" {
  name     = "gemini-cli-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.gemini_runner.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    
    session_affinity = true

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.name}/gemini-cli-web:latest"
      
      env {
        name  = "WORKSPACE_DIR"
        value = "/mnt/gcs-workspace"
      }

      volume_mounts {
        name       = "gcs-workspace"
        mount_path = "/mnt/gcs-workspace"
      }
    }

    volumes {
      name = "gcs-workspace"
      gcs {
        bucket    = google_storage_bucket.workspace.name
        read_only = false
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.cloud_run,
    google_storage_bucket_iam_member.workspace_admin
  ]
}

# 7. Make the service public (Optional/Experimental)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.web_terminal.location
  name     = google_cloud_run_v2_service.web_terminal.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
