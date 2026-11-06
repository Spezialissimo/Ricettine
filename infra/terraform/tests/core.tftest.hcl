# Plan-time checks of the core stack. Providers are mocked: nothing here talks to AWS.
# prevent_destroy cannot be read from a test; scripts/infra-check.sh greps for it.

mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "random" {}

override_data {
  target = data.aws_ssm_parameter.al2023_arm64
  values = {
    value = "ami-0123456789abcdef0"
  }
}

override_data {
  target = data.aws_ec2_managed_prefix_list.cloudfront
  values = {
    id = "pl-0123456789abcdef0"
  }
}

override_data {
  target = data.aws_availability_zones.available
  values = {
    names = ["eu-west-1a", "eu-west-1b"]
  }
}

override_data {
  target = data.aws_caller_identity.current
  values = {
    account_id = "123456789012"
  }
}

# random_password results are unknown at plan time; give them known values so the
# "no plaintext secret in user-data" check compares against real strings.
override_resource {
  target          = random_password.postgres
  override_during = plan
  values = {
    result = "MOCKPOSTGRESPASSWORD0123456789abcdef"
  }
}

override_resource {
  target          = random_password.origin_secret
  override_during = plan
  values = {
    result = "MOCKORIGINSECRET0123456789abcdefghijklmnopqrstuvwx"
  }
}

override_resource {
  target          = aws_ebs_volume.data
  override_during = plan
  values = {
    id = "vol-0123456789abcdef0"
  }
}

# The certificate's validation options are only known after apply; give the mock one so the records exist at plan.
override_resource {
  target          = aws_acm_certificate.main
  override_during = plan
  values = {
    arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
    domain_validation_options = [
      {
        domain_name           = "recipes.example.com"
        resource_record_name  = "_abc.recipes.example.com."
        resource_record_type  = "CNAME"
        resource_record_value = "_def.acm-validations.aws."
      }
    ]
  }
}

override_resource {
  target          = aws_cloudfront_cache_policy.media
  override_during = plan
  values = {
    id = "33333333-3333-3333-3333-333333333333"
  }
}

override_resource {
  target          = aws_cloudfront_origin_request_policy.app
  override_during = plan
  values = {
    id = "44444444-4444-4444-4444-444444444444"
  }
}

override_resource {
  target          = aws_route53_zone.main
  override_during = plan
  values = {
    zone_id = "Z0123456789ABCDEFGHIJ"
  }
}

override_resource {
  target          = aws_cloudfront_distribution.main
  override_during = plan
  values = {
    domain_name = "d111111abcdef8.cloudfront.net"
  }
}

variables {
  domain_name = "recipes.example.com"
  alert_email = "owner@example.com"
}

run "buckets_block_all_public_access" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.media.block_public_acls,
      aws_s3_bucket_public_access_block.media.block_public_policy,
      aws_s3_bucket_public_access_block.media.ignore_public_acls,
      aws_s3_bucket_public_access_block.media.restrict_public_buckets,
    ])
    error_message = "media bucket must block all public access"
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.backups.block_public_acls,
      aws_s3_bucket_public_access_block.backups.block_public_policy,
      aws_s3_bucket_public_access_block.backups.ignore_public_acls,
      aws_s3_bucket_public_access_block.backups.restrict_public_buckets,
    ])
    error_message = "backups bucket must block all public access"
  }
}

run "buckets_are_owner_enforced_encrypted_and_tls_only" {
  command = plan

  assert {
    condition = alltrue([
      alltrue([for r in aws_s3_bucket_ownership_controls.media.rule : r.object_ownership == "BucketOwnerEnforced"]),
      alltrue([for r in aws_s3_bucket_ownership_controls.backups.rule : r.object_ownership == "BucketOwnerEnforced"]),
    ])
    error_message = "both buckets must enforce bucket-owner ownership"
  }

  assert {
    condition = alltrue([
      alltrue([for r in aws_s3_bucket_server_side_encryption_configuration.media.rule : alltrue([for d in r.apply_server_side_encryption_by_default : d.sse_algorithm == "AES256"])]),
      alltrue([for r in aws_s3_bucket_server_side_encryption_configuration.backups.rule : alltrue([for d in r.apply_server_side_encryption_by_default : d.sse_algorithm == "AES256"])]),
    ])
    error_message = "both buckets must use SSE-S3"
  }

  assert {
    condition = alltrue([
      jsondecode(aws_s3_bucket_policy.media.policy).Statement[0].Effect == "Deny",
      jsondecode(aws_s3_bucket_policy.media.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false",
      jsondecode(aws_s3_bucket_policy.backups.policy).Statement[0].Effect == "Deny",
      jsondecode(aws_s3_bucket_policy.backups.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false",
    ])
    error_message = "both buckets must deny non-TLS requests"
  }
}

run "security_group_has_no_ssh_and_443_only_from_cloudfront" {
  command = plan

  assert {
    condition = alltrue([
      for r in [
        aws_vpc_security_group_ingress_rule.http_v4,
        aws_vpc_security_group_ingress_rule.http_v6,
        aws_vpc_security_group_ingress_rule.https,
      ] : r.from_port != 22 && r.to_port != 22
    ])
    error_message = "no ingress rule may open port 22"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.https.prefix_list_id == "pl-0123456789abcdef0"
    error_message = "443 must reference the CloudFront origin-facing prefix list"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.https.cidr_ipv4 == null && aws_vpc_security_group_ingress_rule.https.cidr_ipv6 == null
    error_message = "443 must not have any CIDR source"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.https.from_port == 443 && aws_vpc_security_group_ingress_rule.https.to_port == 443
    error_message = "https rule must be exactly 443"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.http_v4.from_port == 80 && aws_vpc_security_group_ingress_rule.http_v6.from_port == 80
    error_message = "port 80 is open for ACME HTTP-01"
  }
}

run "volumes_are_encrypted" {
  command = plan

  assert {
    condition     = aws_instance.main.root_block_device[0].encrypted == true
    error_message = "root volume must be encrypted"
  }

  assert {
    condition     = aws_instance.main.root_block_device[0].volume_size == 8
    error_message = "root volume is 8 GiB"
  }

  assert {
    condition     = aws_ebs_volume.data.encrypted == true && aws_ebs_volume.data.type == "gp3"
    error_message = "data volume must be encrypted gp3"
  }

  assert {
    condition     = aws_ebs_volume.data.size == var.data_volume_gb
    error_message = "data volume size comes from var.data_volume_gb"
  }
}

run "imdsv2_is_required" {
  command = plan

  assert {
    condition     = aws_instance.main.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 must be required"
  }

  assert {
    condition     = aws_instance.main.metadata_options[0].http_put_response_hop_limit == 2
    error_message = "hop limit 2 lets containers reach the instance profile"
  }
}

run "backups_expire_after_retention_days" {
  command = plan

  variables {
    backup_retention_days = 45
  }

  assert {
    condition     = one(flatten([for r in aws_s3_bucket_lifecycle_configuration.backups.rule : [for e in r.expiration : e.days]])) == 45
    error_message = "backups lifecycle expiration must equal var.backup_retention_days"
  }
}

run "backup_role_cannot_delete_backups" {
  command = plan

  assert {
    condition = !anytrue([
      for s in jsondecode(aws_iam_role_policy.instance.policy).Statement :
      contains(flatten([s.Action]), "s3:DeleteObject") && anytrue([for r in flatten([s.Resource]) : strcontains(r, "-backups")])
    ])
    error_message = "the instance must not be able to delete backups"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.instance.policy).Statement :
      contains(flatten([s.Action]), "s3:PutObject") && contains(flatten([s.Resource]), "arn:aws:s3:::ricettine-backups-123456789012/db/*")
    ])
    error_message = "the instance must be able to put dumps under db/"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.instance.policy).Statement :
      contains(flatten([s.Action]), "s3:DeleteObject") && contains(flatten([s.Resource]), "arn:aws:s3:::ricettine-media-123456789012/*")
    ])
    error_message = "the instance must be able to delete media objects"
  }
}

run "media_bucket_listing_allowed" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.instance.policy).Statement :
      contains(flatten([s.Action]), "s3:ListBucket") && flatten([s.Resource]) == ["arn:aws:s3:::ricettine-media-123456789012"]
    ])
    error_message = "ListBucket on the media bucket is needed so a missing key is 404 (NoSuchKey), not 403"
  }
}

run "backups_are_versioned_and_old_versions_expire" {
  command = plan

  variables {
    backup_retention_days = 45
  }

  assert {
    condition     = aws_s3_bucket_versioning.backups.versioning_configuration[0].status == "Enabled"
    error_message = "backups bucket must be versioned"
  }

  assert {
    condition     = one(flatten([for r in aws_s3_bucket_lifecycle_configuration.backups.rule : [for n in r.noncurrent_version_expiration : n.noncurrent_days]])) == 45
    error_message = "noncurrent backup versions must expire after var.backup_retention_days"
  }
}

run "user_data_has_timer_and_no_secret" {
  command = plan

  assert {
    condition     = strcontains(aws_instance.main.user_data, "ricettine-backup.timer")
    error_message = "user-data must install the backup timer"
  }

  assert {
    condition     = !strcontains(aws_instance.main.user_data, random_password.postgres.result) && !strcontains(aws_instance.main.user_data, random_password.origin_secret.result)
    error_message = "user-data must not contain the secrets"
  }

  assert {
    condition     = strcontains(aws_instance.main.user_data, "VOLUME_ID=vol-0123456789abcdef0") && strcontains(aws_instance.main.user_data, "RequiresMountsFor=/srv/ricettine")
    error_message = "user-data must pass the volume id to mount-data.sh and order docker after the mount"
  }

  assert {
    condition     = strcontains(aws_instance.main.user_data, "set -euo pipefail")
    error_message = "the bootstrap script must stop at the first failure"
  }

  assert {
    condition     = strcontains(aws_instance.main.user_data, "BACKUP_S3_URI=s3://ricettine-backups-123456789012/db/")
    error_message = "backup unit must target the backups bucket"
  }
}

run "secrets_live_in_ssm_securestrings" {
  command = plan

  assert {
    condition     = aws_ssm_parameter.postgres_password.type == "SecureString" && aws_ssm_parameter.postgres_password.name == "/ricettine/postgres-password"
    error_message = "postgres password goes to SSM SecureString"
  }

  assert {
    condition     = aws_ssm_parameter.origin_secret.type == "SecureString" && aws_ssm_parameter.origin_secret.name == "/ricettine/origin-secret"
    error_message = "origin secret goes to SSM SecureString"
  }

  assert {
    condition     = random_password.origin_secret.special == false && random_password.origin_secret.length == 48
    error_message = "origin secret must be alphanumeric, 48 chars"
  }

  assert {
    condition     = random_password.postgres.length == 32
    error_message = "postgres password is 32 chars"
  }
}

run "budget_alarm" {
  command = plan

  variables {
    monthly_budget_usd = 25
  }

  assert {
    condition     = aws_budgets_budget.monthly.limit_amount == "25.0" && aws_budgets_budget.monthly.budget_type == "COST" && aws_budgets_budget.monthly.time_unit == "MONTHLY"
    error_message = "budget limit follows var.monthly_budget_usd"
  }

  assert {
    condition     = alltrue([for c in aws_budgets_budget.monthly.cost_types : c.include_credit == false])
    error_message = "budget must show gross spend (credits excluded)"
  }

  assert {
    condition     = length(aws_budgets_budget.monthly.notification) == 2
    error_message = "two notifications"
  }

  assert {
    condition = alltrue([
      anytrue([for n in aws_budgets_budget.monthly.notification : n.threshold == 80 && n.notification_type == "ACTUAL"]),
      anytrue([for n in aws_budgets_budget.monthly.notification : n.threshold == 100 && n.notification_type == "FORECASTED"]),
      alltrue([for n in aws_budgets_budget.monthly.notification : contains(n.subscriber_email_addresses, "owner@example.com")]),
    ])
    error_message = "80 % ACTUAL and 100 % FORECASTED to var.alert_email"
  }
}

run "region_must_be_eu" {
  command = plan

  variables {
    region = "us-east-1"
  }

  expect_failures = [var.region]
}

run "instance_must_be_graviton_t4g" {
  command = plan

  variables {
    instance_type = "t3.small"
  }

  expect_failures = [var.instance_type]
}
