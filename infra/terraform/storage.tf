data "aws_caller_identity" "current" {}

locals {
  media_bucket_name   = "ricettine-media-${data.aws_caller_identity.current.account_id}"
  backups_bucket_name = "ricettine-backups-${data.aws_caller_identity.current.account_id}"
  # Built by hand (not from the bucket resources) so the IAM policy is known at plan time.
  media_bucket_arn   = "arn:aws:s3:::${local.media_bucket_name}"
  backups_bucket_arn = "arn:aws:s3:::${local.backups_bucket_name}"
}

# Recipe photos. Versioned so an app bug, operator mistake or compromised host cannot destroy every photo for good.
# A deleted photo stays recoverable for backup_retention_days, the same window the database dumps keep that data.
resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket     = aws_s3_bucket.media.id
  depends_on = [aws_s3_bucket_versioning.media]

  rule {
    id     = "expire-deleted-photos"
    status = "Enabled"

    filter {}

    # Current versions never expire; only what was deleted or replaced goes after the retention window.
    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }

    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket     = aws_s3_bucket.media.id
  depends_on = [aws_s3_bucket_public_access_block.media]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [local.media_bucket_arn, "${local.media_bucket_arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Database dumps. The instance can write but not delete; old dumps expire through the lifecycle rule.
resource "aws_s3_bucket" "backups" {
  bucket = local.backups_bucket_name
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "backups" {
  bucket     = aws_s3_bucket.backups.id
  depends_on = [aws_s3_bucket_public_access_block.backups]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [local.backups_bucket_arn, "${local.backups_bucket_arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Versioned so a compromised host cannot silently overwrite a known key: the old version stays until it expires.
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket     = aws_s3_bucket.backups.id
  depends_on = [aws_s3_bucket_versioning.backups]

  rule {
    id     = "expire-old-dumps"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Request metrics for the db/ prefix feed the staleness alarm in alerts.tf (S3 emits them once requests occur).
resource "aws_s3_bucket_metric" "backups_db" {
  bucket = aws_s3_bucket.backups.id
  name   = "db-dumps"

  filter {
    prefix = "db/"
  }
}
