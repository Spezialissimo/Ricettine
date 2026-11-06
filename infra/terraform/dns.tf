# Terraform creates the zone; the owner points the registrar's nameservers at the `name_servers` output.
# First deploy is two steps (see docs/deploy-aws.md): apply this zone alone, delegate, then apply everything.
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "Ricettine"
}

locals {
  # Fixed hosted zone id of every CloudFront distribution, used by alias records.
  cloudfront_hosted_zone_id = "Z2FDTNDATAQYW2"
}

resource "aws_route53_record" "cert_validation" {
  # One name, so the key is static: the validation options themselves are only known after apply.
  for_each = toset([var.domain_name])

  zone_id         = aws_route53_zone.main.zone_id
  name            = one([for o in aws_acm_certificate.main.domain_validation_options : o.resource_record_name if o.domain_name == each.key])
  type            = one([for o in aws_acm_certificate.main.domain_validation_options : o.resource_record_type if o.domain_name == each.key])
  records         = [one([for o in aws_acm_certificate.main.domain_validation_options : o.resource_record_value if o.domain_name == each.key])]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_route53_record" "site_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = local.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# CloudFront reaches the instance here (Caddy gets its Let's Encrypt certificate for this name).
resource "aws_route53_record" "origin" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.origin_domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.origin.public_ip]
}
