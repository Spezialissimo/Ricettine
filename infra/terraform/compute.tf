data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  origin_domain = "${var.origin_subdomain}.${var.domain_name}"
  # Pinned and checksummed (docker-compose-linux-aarch64 from the GitHub release's checksums.txt).
  compose_version = "v5.7.0"
  compose_sha256  = "15861535d14e26555736b49376c95e14bfd94285366c8446bfac7156a972e76f"

  # Rendered once and gzipped: the raw text is close to EC2's 16,384-byte user-data limit, the gzip is far below it.
  cloud_init = templatefile("${path.module}/templates/cloud-init.yaml.tftpl", {
    region          = var.region
    domain_name     = var.domain_name
    origin_domain   = local.origin_domain
    image_tag       = var.image_tag
    media_bucket    = local.media_bucket_name
    backups_bucket  = local.backups_bucket_name
    compose_version = local.compose_version
    compose_sha256  = local.compose_sha256
    data_volume_id  = aws_ebs_volume.data.id

    compose_yaml     = file("${path.module}/../../compose.yaml")
    compose_aws_yaml = file("${path.module}/../../compose.aws.yaml")
    caddyfile        = file("${path.module}/../../deploy/aws/Caddyfile")
    backup_sh        = file("${path.module}/../../deploy/backup.sh")
    mount_data_sh    = file("${path.module}/../../deploy/aws/mount-data.sh")
    start_sh         = file("${path.module}/../../deploy/aws/start.sh")
    service_unit     = file("${path.module}/../../deploy/aws/ricettine.service")
    backup_service = replace(replace(
      file("${path.module}/../../deploy/aws/ricettine-backup.service"),
      "__BACKUPS_BUCKET__", local.backups_bucket_name),
    "__REGION__", var.region)
    backup_timer = file("${path.module}/../../deploy/aws/ricettine-backup.timer")
  })
}

resource "aws_instance" "main" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.origin.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Burstable CPU stays capped at the baseline (no surprise credit charges); set "unlimited" to trade cost for headroom.
  credit_specification {
    cpu_credits = "standard"
  }

  user_data_base64 = base64gzip(local.cloud_init)

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 only
    # Hop limit 2 lets the app container (one Docker network hop away) reach the instance profile
    # through IMDS for its S3 credentials. Host processes (start.sh, backup) need only 1.
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  tags = { Name = "ricettine" }

  lifecycle {
    # A new AMI release or a template tweak must never replace the host (and its running data) by surprise.
    ignore_changes = [ami, user_data_base64]
  }

  depends_on = [aws_internet_gateway.main, aws_route_table_association.public]
}

resource "aws_eip" "origin" {
  domain   = "vpc"
  instance = aws_instance.main.id

  tags = { Name = "ricettine-origin" }

  depends_on = [aws_internet_gateway.main]
}

# Postgres lives here, apart from the instance, so replacing the host keeps the data.
resource "aws_ebs_volume" "data" {
  availability_zone = aws_subnet.public.availability_zone
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true

  tags = { Name = "ricettine-data" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.main.id

  stop_instance_before_detaching = true
}
