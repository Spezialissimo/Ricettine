data "aws_availability_zones" "available" {
  state = "available"
}

# CloudFront's origin-facing addresses. Other people's distributions share this list,
# which is why Caddy also checks the X-Origin-Verify secret.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "ricettine" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "ricettine" }
}

# One public subnet, no NAT gateway: the instance has its own public address.
resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.1.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = { Name = "ricettine-public" }

  lifecycle {
    # A change in the AZ list order must not replace the subnet (and cascade to the instance).
    ignore_changes = [availability_zone]
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "ricettine-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "origin" {
  name        = "ricettine-origin"
  description = "Caddy origin: 80 for ACME, 443 from CloudFront only. No SSH (use SSM Session Manager)."
  vpc_id      = aws_vpc.main.id

  tags = { Name = "ricettine-origin" }
}

resource "aws_vpc_security_group_ingress_rule" "http_v4" {
  security_group_id = aws_security_group.origin.id
  description       = "HTTP for Let's Encrypt HTTP-01 and the redirect"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "http_v6" {
  security_group_id = aws_security_group.origin.id
  description       = "HTTP for Let's Encrypt HTTP-01 and the redirect"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv6         = "::/0"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.origin.id
  description       = "HTTPS from the CloudFront origin-facing prefix list only"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.origin.id
  description       = "All outbound (image pulls, Let's Encrypt, S3, SSM)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
