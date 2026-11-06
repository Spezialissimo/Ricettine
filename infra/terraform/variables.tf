variable "region" {
  description = "AWS region for everything except the CloudFront certificate. EU only."
  type        = string
  default     = "eu-west-1"

  validation {
    condition     = startswith(var.region, "eu-")
    error_message = "The region must be an EU region (eu-*)."
  }
}

variable "domain_name" {
  description = "Public domain of the site: an apex (example.com; set the registrar nameservers to the name_servers output) or a subdomain (recipes.example.com; add NS records for it at the parent zone DNS host). Terraform creates a Route 53 zone with this name; a zone created automatically by buying the domain in Route 53 must be deleted or imported."
  type        = string
}

variable "origin_subdomain" {
  description = "Subdomain of domain_name for the origin that CloudFront talks to."
  type        = string
  default     = "origin"
}

variable "instance_type" {
  description = "EC2 instance type. Graviton only: the image is built for arm64 and amd64."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = startswith(var.instance_type, "t4g.")
    error_message = "The instance type must be a t4g (Graviton) type."
  }
}

variable "data_volume_gb" {
  description = "Size of the data volume (Postgres) in GiB."
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "Days before old database dumps expire from the backups bucket."
  type        = number
  default     = 30
}

variable "image_tag" {
  description = "Tag of ghcr.io/spezialissimo/ricettine to run (becomes RICETTINE_VERSION)."
  type        = string
  default     = "latest"
}

variable "alert_email" {
  description = "Email address for budget alerts."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly spend limit that triggers the budget alerts, in USD."
  type        = number
  default     = 25
}
