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
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {}

# 1. Enable required APIs
resource "google_project_service" "cloud_run" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  service = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iap" {
  service = "iap.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  service = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# 2. Artifact Registry for the Docker image
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
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

# 5b. Grant Cloud Build service account access to staging bucket
# (Using the Compute Engine default service account as seen in the error message)
resource "google_project_iam_member" "compute_storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_project_iam_member" "compute_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# 6. Cloud Run Service (Experimental)
# Note: Initial deployment might fail if the image doesn't exist yet.
# In a real MVP, you'd build and push the image before applying this part,
# or use a placeholder image initially.
resource "google_cloud_run_v2_service" "web_terminal" {
  provider            = google-beta
  name                = var.service_name
  location            = var.region
  project             = var.project_id
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"
  iap_enabled         = var.use_iap
  launch_stage        = "BETA"

  template {
    service_account = google_service_account.gemini_runner.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    
    session_affinity = true

    containers {
      image = var.container_image
      
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

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_project_service.cloud_run,
    google_project_service.iap,
    google_storage_bucket_iam_member.workspace_admin
  ]
}

# 7. Make the service public (Optional/Experimental)
# Only when IAP is not enabled.
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count    = var.use_iap ? 0 : 1
  location = google_cloud_run_v2_service.web_terminal.location
  name     = google_cloud_run_v2_service.web_terminal.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 8. Grant IAP access to a specific user
resource "google_iap_web_backend_service_iam_member" "iap_access" {
  count                = (var.use_iap && var.iap_access_user != "") ? 1 : 0
  project              = var.project_id
  web_backend_service  = google_cloud_run_v2_service.web_terminal.name
  role                 = "roles/iap.httpsResourceAccessor"
  member               = var.iap_access_user
}
