# Web terminal

The Web terminal lets you deploy Gemini CLI as a web-accessible service on
Google Cloud Run. This provides a persistent, browser-based environment for
interacting with the agent from anywhere.

> **Note:** This is a preview feature currently under active development.

## Architecture

The Web terminal architecture bridges the gap between a stateful interactive CLI
and a stateless cloud environment using the following components:

- **Frontend:** A lightweight static page using `Xterm.js` that renders the
  terminal and forwards keystrokes via WebSockets.
- **Compute:** A Node.js server running on Cloud Run that spawns the Gemini CLI
  in a pseudo-terminal (PTY) and streams output to the browser.
- **Storage:** Google Cloud Storage (GCS) mounted via FUSE to provide a
  persistent workspace for the agent's file operations.

## Prerequisites

Before deploying the Web terminal, you must have the following:

- A Google Cloud project with billing enabled.
- The Google Cloud CLI (`gcloud`) installed and authenticated.
- Docker installed locally for building the container image.

## Deployment

You can deploy the Web terminal using the provided deployment script or by
manually executing the steps.

### Using the deployment script

The project includes a helper script that automates the creation of resources
and deployment of the service.

1.  From the project root, run the deployment script:
    ```bash
    ./scripts/deploy_web_terminal.sh
    ```
2.  Follow the prompts to configure your project and region if necessary.
3.  Once complete, the script provides the URL for your deployed Web terminal.

### Manual deployment

If you prefer to deploy manually, follow these steps to set up the environment.

1.  **Create a GCS bucket:** This bucket serves as the persistent workspace for
    the agent.
    ```bash
    gsutil mb -l us-central1 gs://your-project-id-gemini-workspace
    ```
2.  **Build the Docker image:** Use the specialized Dockerfile for the web
    terminal.
    ```bash
    gcloud builds submit --tag gcr.io/your-project-id/gemini-cli-web:latest --file Dockerfile.web-terminal .
    ```
3.  **Deploy to Cloud Run:** Deploy the service with the necessary configuration
    for GCS FUSE and session affinity.
    ```bash
    gcloud run deploy gemini-cli-web \
      --image gcr.io/your-project-id/gemini-cli-web:latest \
      --region us-central1 \
      --execution-environment gen2 \
      --add-volume="name=gcs-workspace,type=cloud-storage,bucket=your-project-id-gemini-workspace" \
      --add-volume-mount="volume=gcs-workspace,mount-path=/mnt/gcs-workspace" \
      --session-affinity
    ```

## Usage

After deployment, you can access the Gemini CLI through your browser.

1.  Navigate to the service URL provided by Cloud Run.
2.  The terminal initializes and starts a new Gemini CLI session.
3.  Interact with the agent using standard terminal commands and keystrokes.

The workspace is persisted in the GCS bucket. Any files created or modified by
the agent remain available across sessions and service restarts.

## Security considerations

Deploying a tool capable of executing shell commands to the web requires robust
security measures.

- **Authentication:** We recommend using Google Cloud Identity-Aware Proxy (IAP)
  to restrict access to authorized users only.
- **IAM Roles:** Ensure the Cloud Run service account has the minimum necessary
  permissions to access the GCS bucket and other required resources.
- **Network:** Use VPC egress if the agent needs to reach internal APIs or
  resources.

## Next steps

- Learn more about [configuring Gemini CLI](./reference/configuration.md).
- Explore [available tools and integrations](./tools/index.md).
