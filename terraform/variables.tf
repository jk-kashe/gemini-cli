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

variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The Google Cloud region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "The name of the Cloud Run service"
  type        = string
  default     = "gemini-cli-web"
}

variable "repository_name" {
  description = "The name of the Artifact Registry repository"
  type        = string
  default     = "gemini-cli-repo"
}

variable "container_image" {
  description = "The container image to deploy. Defaults to a public placeholder so Terraform can apply successfully before the real image is built/pushed."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "use_iap" {
  description = "Whether to enable Identity-Aware Proxy (IAP) for the Cloud Run service"
  type        = bool
  default     = true
}

variable "iap_access_user" {
  description = "The email address of the user to grant IAP access to. Format: user:email@example.com"
  type        = string
  default     = ""
}
