# Copy to terraform.tfvars (gitignored) and edit. Run: terraform apply -var-file=terraform.tfvars
# Pick ONE (see "Account setup" and "First deploy" in docs/deploy-aws.md):
#  - apex domain:  domain_name = "example.com"          -> set custom nameservers at the registrar
#  - subdomain:    domain_name = "recipes.example.com"  -> add NS records for "recipes" at the parent's DNS host
domain_name = "recipes.example.com"
alert_email = "you@example.com"

# Optional, with their defaults:
# region             = "eu-west-1"
# instance_type      = "t4g.small"
# data_volume_gb     = 20
# monthly_budget_usd = 25
# backup_retention_days = 30
# origin_subdomain   = "origin"
# image_tag          = "latest" # only used by a NEW instance; see "Upgrade" in docs/deploy-aws.md
