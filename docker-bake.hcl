// docker-bake.hcl — Build all Lamdis service images in parallel
//
// Usage:
//   docker buildx bake                    # build all
//   docker buildx bake api                # build just api
//   docker buildx bake --push             # build and push all
//
// Set LAMDIS_VERSION env var to tag images (default: latest)

variable "LAMDIS_VERSION" {
  default = "latest"
}

variable "REGISTRY" {
  default = "ghcr.io/lamdis-ai"
}

group "default" {
  targets = ["api", "runs", "web"]
}

target "api" {
  context    = "."
  dockerfile = "lamdis-api/Dockerfile"
  tags       = ["${REGISTRY}/lamdis-api:${LAMDIS_VERSION}"]
  platforms  = ["linux/amd64"]
}

target "runs" {
  context    = "."
  dockerfile = "lamdis-runs/Dockerfile"
  tags       = ["${REGISTRY}/lamdis-runs:${LAMDIS_VERSION}"]
  platforms  = ["linux/amd64"]
}

target "web" {
  context    = "lamdis-web"
  dockerfile = "Dockerfile"
  tags       = ["${REGISTRY}/lamdis-web:${LAMDIS_VERSION}"]
  platforms  = ["linux/amd64"]
  secret     = ["id=NPM_TOKEN,env=NPM_TOKEN"]
}

