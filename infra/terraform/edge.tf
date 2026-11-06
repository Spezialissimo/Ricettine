# CloudFront certificates must come from us-east-1. DNS validation needs the zone delegated first.
resource "aws_acm_certificate" "main" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# AWS-managed policies, by their documented ids ("Managed-CachingDisabled" and "Managed-SecurityHeadersPolicy").
# A by-name data lookup would return the same ids, but its id attribute cannot be mocked in `terraform test`.
locals {
  caching_disabled_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  security_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
}

# /media/*: the app decides per response. Recipe and cookbook photos are `private` (never stored at the edge);
# avatars are `public, immutable` and are capped at one day here, so a deleted account clears within a day.
resource "aws_cloudfront_cache_policy" "media" {
  name        = "ricettine-media"
  comment     = "Honour the origin's Cache-Control, at most one day"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 86400

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = false
    enable_accept_encoding_brotli = false

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

# Everything the app needs from the viewer. CloudFront-Viewer-Address is how Caddy learns the client IP.
resource "aws_cloudfront_origin_request_policy" "app" {
  name    = "ricettine-app"
  comment = "Forward cookies, query strings and the headers the app uses"

  cookies_config {
    cookie_behavior = "all"
  }
  query_strings_config {
    query_string_behavior = "all"
  }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Language",
        "Content-Type",
        "If-None-Match",
        "If-Modified-Since",
        "Origin",
        "Referer",
        "User-Agent",
        "X-XSRF-TOKEN",
        "CloudFront-Viewer-Address",
      ]
    }
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Ricettine"
  aliases         = [var.domain_name]
  price_class     = "PriceClass_100"
  http_version    = "http2and3"

  # No logging_config on purpose: invite, reset and share tokens are in URL paths.

  origin {
    origin_id   = "app"
    domain_name = local.origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Caddy answers 403 without this header: the CloudFront prefix list is shared with other accounts.
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_secret.result
    }
  }

  default_cache_behavior {
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.caching_disabled_policy_id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.app.id
    response_headers_policy_id = local.security_headers_policy_id
  }

  ordered_cache_behavior {
    path_pattern               = "/media/*"
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.app.id
    response_headers_policy_id = local.security_headers_policy_id
  }

  # Do not let CloudFront remember origin errors (a 502 while the host boots must clear the moment it is up).
  dynamic "custom_error_response" {
    for_each = [403, 404, 500, 502, 503, 504]
    content {
      error_code            = custom_error_response.value
      error_caching_min_ttl = 0
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.main.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
