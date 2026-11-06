# Copy to terraform.tfvars (gitignored) and edit. Run: terraform apply -var-file=terraform.tfvars
domain_name = "recipes.example.com"
alert_email = "you@example.com"

# Optional, with their defaults:
# region             = "eu-west-1"
# instance_type      = "t4g.small"
# data_volume_gb     = 20
# monthly_budget_usd = 10
# image_tag          = "latest" # only used by a NEW instance; see "Upgrade" in docs/deploy-aws.md
