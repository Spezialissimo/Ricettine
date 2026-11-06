resource "aws_iam_role" "instance" {
  name = "ricettine-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Session Manager: the only way in (no SSH).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "instance" {
  name = "ricettine-instance"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "MediaObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${local.media_bucket_arn}/*"
      },
      {
        # Without ListBucket, S3 answers 403 (not NoSuchKey) for a missing key, and the app would turn a 404 into a 500.
        Sid      = "MediaList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = local.media_bucket_arn
      },
      {
        # Put only, and only under db/: a compromised host cannot delete or overwrite-by-delete backups.
        Sid      = "BackupUploads"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${local.backups_bucket_arn}/db/*"
      },
      {
        Sid      = "BackupFailureAlert"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Sid      = "ReadOwnSecrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/ricettine/*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "instance" {
  name = "ricettine-instance"
  role = aws_iam_role.instance.name
}
