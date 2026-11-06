# Plan-time checks of the edge layer (Route 53, ACM, CloudFront). Providers are mocked: nothing here talks to AWS.
# CloudFront standard logging stays off: invite, reset and share tokens sit in URL paths.

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

override_resource {
  target          = aws_ebs_volume.data
  override_during = plan
  values = {
    id = "vol-0123456789abcdef0"
  }
}

override_resource {
  target          = random_password.origin_secret
  override_during = plan
  values = {
    result = "MOCKORIGINSECRET0123456789abcdefghijklmnopqrstuvwx"
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

override_resource {
  target          = aws_eip.origin
  override_during = plan
  values = {
    public_ip = "203.0.113.10"
  }
}

override_resource {
  target          = aws_sns_topic.alerts
  override_during = plan
  values = {
    arn = "arn:aws:sns:eu-west-1:123456789012:ricettine-alerts"
  }
}

variables {
  domain_name = "recipes.example.com"
  alert_email = "owner@example.com"
}

run "origin_is_https_only_with_secret_header" {
  command = plan

  assert {
    condition     = length(aws_cloudfront_distribution.main.origin) == 1 && length(one(aws_cloudfront_distribution.main.origin).custom_origin_config) == 1 && length(one(aws_cloudfront_distribution.main.origin).custom_header) == 1
    error_message = "exactly one origin with one custom_origin_config and one custom header (the checks below must not pass vacuously)"
  }

  assert {
    condition     = alltrue([for o in aws_cloudfront_distribution.main.origin : alltrue([for c in o.custom_origin_config : c.origin_protocol_policy == "https-only" && contains(c.origin_ssl_protocols, "TLSv1.2") && !contains(c.origin_ssl_protocols, "TLSv1")])])
    error_message = "the origin must be https-only with TLSv1.2"
  }

  assert {
    condition     = alltrue([for o in aws_cloudfront_distribution.main.origin : o.domain_name == "origin.recipes.example.com"])
    error_message = "the origin must be origin.<domain>"
  }

  assert {
    condition     = alltrue([for o in aws_cloudfront_distribution.main.origin : alltrue([for h in o.custom_header : h.name == "X-Origin-Verify"])])
    error_message = "the custom origin header must be X-Origin-Verify"
  }

  assert {
    condition     = alltrue([for o in aws_cloudfront_distribution.main.origin : alltrue([for h in o.custom_header : h.value == random_password.origin_secret.result])])
    error_message = "X-Origin-Verify must carry the same value as the SSM origin secret"
  }
}

run "viewers_are_redirected_to_https" {
  command = plan

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "the default behaviour must redirect to https"
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.ordered_cache_behavior) == 1
    error_message = "exactly one ordered behaviour (/media/*)"
  }

  assert {
    condition     = alltrue([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b.viewer_protocol_policy == "redirect-to-https"])
    error_message = "every ordered behaviour must redirect to https"
  }
}

run "default_behaviour_is_uncached" {
  command = plan

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    error_message = "the default behaviour must use the managed CachingDisabled policy (4135ea2d-...)"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].response_headers_policy_id == "67f7725c-6f97-4210-82d7-5512b31e9d03"
    error_message = "the default behaviour must use the managed SecurityHeadersPolicy"
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.default_cache_behavior[0].allowed_methods) == 7
    error_message = "the default behaviour must allow all methods"
  }
}

run "media_cache_policy_is_short_and_cookieless" {
  command = plan

  assert {
    condition     = aws_cloudfront_cache_policy.media.min_ttl == 0 && aws_cloudfront_cache_policy.media.default_ttl == 0
    error_message = "the media cache policy must have min and default TTL 0"
  }

  assert {
    condition     = aws_cloudfront_cache_policy.media.max_ttl <= 86400
    error_message = "the media max TTL must be at most one day"
  }

  assert {
    condition     = alltrue([for p in aws_cloudfront_cache_policy.media.parameters_in_cache_key_and_forwarded_to_origin : alltrue([for c in p.cookies_config : c.cookie_behavior == "none"])])
    error_message = "cookies must not be part of the media cache key"
  }

  assert {
    condition     = alltrue([for p in aws_cloudfront_cache_policy.media.parameters_in_cache_key_and_forwarded_to_origin : alltrue([for h in p.headers_config : h.header_behavior == "none"])])
    error_message = "headers must not be part of the media cache key"
  }

  assert {
    condition     = alltrue([for p in aws_cloudfront_cache_policy.media.parameters_in_cache_key_and_forwarded_to_origin : alltrue([for q in p.query_strings_config : q.query_string_behavior == "all"])])
    error_message = "all query strings must be part of the media cache key"
  }

  assert {
    condition     = alltrue([for p in aws_cloudfront_cache_policy.media.parameters_in_cache_key_and_forwarded_to_origin : !p.enable_accept_encoding_gzip && !p.enable_accept_encoding_brotli])
    error_message = "media (JPEG) must not be compressed"
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.ordered_cache_behavior) == 1
    error_message = "exactly one ordered behaviour (/media/*)"
  }

  assert {
    condition     = alltrue([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b.path_pattern == "/media/*" && b.cache_policy_id == aws_cloudfront_cache_policy.media.id && length(b.allowed_methods) == 2])
    error_message = "/media/* must be GET/HEAD with the media cache policy"
  }
}

run "origin_request_forwards_what_the_app_needs" {
  command = plan

  assert {
    condition = alltrue([
      contains(flatten([for h in aws_cloudfront_origin_request_policy.app.headers_config : [for hh in h.headers : tolist(hh.items)]]), "CloudFront-Viewer-Address"),
      contains(flatten([for h in aws_cloudfront_origin_request_policy.app.headers_config : [for hh in h.headers : tolist(hh.items)]]), "X-XSRF-TOKEN"),
      contains(flatten([for h in aws_cloudfront_origin_request_policy.app.headers_config : [for hh in h.headers : tolist(hh.items)]]), "If-None-Match"),
    ])
    error_message = "the origin request whitelist must contain CloudFront-Viewer-Address, X-XSRF-TOKEN and If-None-Match"
  }

  assert {
    condition     = alltrue([for c in aws_cloudfront_origin_request_policy.app.cookies_config : c.cookie_behavior == "all"])
    error_message = "all cookies must be forwarded to the origin"
  }

  assert {
    condition     = alltrue([for q in aws_cloudfront_origin_request_policy.app.query_strings_config : q.query_string_behavior == "all"])
    error_message = "all query strings must be forwarded to the origin"
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.ordered_cache_behavior) == 1
    error_message = "exactly one ordered behaviour (/media/*)"
  }

  assert {
    condition     = alltrue([for b in aws_cloudfront_distribution.main.ordered_cache_behavior : b.origin_request_policy_id == aws_cloudfront_origin_request_policy.app.id]) && aws_cloudfront_distribution.main.default_cache_behavior[0].origin_request_policy_id == aws_cloudfront_origin_request_policy.app.id
    error_message = "both behaviours must use the app origin request policy"
  }
}

run "distribution_settings" {
  command = plan

  assert {
    condition     = contains(aws_cloudfront_distribution.main.aliases, "recipes.example.com")
    error_message = "the distribution must serve the domain"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.price_class == "PriceClass_100" && aws_cloudfront_distribution.main.is_ipv6_enabled
    error_message = "price class 100 with IPv6"
  }

  assert {
    condition     = length(aws_cloudfront_distribution.main.logging_config) == 0
    error_message = "CloudFront logging must stay off (tokens are in URL paths)"
  }

  assert {
    condition     = alltrue([for v in aws_cloudfront_distribution.main.viewer_certificate : v.minimum_protocol_version == "TLSv1.2_2021" && v.ssl_support_method == "sni-only"])
    error_message = "SNI-only with a modern TLS floor"
  }
}

run "certificate_is_in_us_east_1_and_dns_validated" {
  command = plan

  assert {
    condition     = aws_acm_certificate.main.domain_name == "recipes.example.com" && aws_acm_certificate.main.validation_method == "DNS"
    error_message = "the certificate is for the domain and DNS-validated"
  }

  assert {
    condition     = length(aws_route53_record.cert_validation) == 1
    error_message = "one validation record per domain validation option"
  }

  assert {
    condition     = alltrue([for r in aws_route53_record.cert_validation : r.zone_id == aws_route53_zone.main.zone_id])
    error_message = "validation records must live in the created zone"
  }
}

run "zone_and_records" {
  command = plan

  assert {
    condition     = aws_route53_zone.main.name == "recipes.example.com"
    error_message = "the zone is created for the domain"
  }

  assert {
    condition     = alltrue([for r in [aws_route53_record.site_a, aws_route53_record.site_aaaa, aws_route53_record.origin] : r.zone_id == aws_route53_zone.main.zone_id])
    error_message = "all records belong to the created zone"
  }

  assert {
    condition     = aws_route53_record.site_a.type == "A" && aws_route53_record.site_aaaa.type == "AAAA" && aws_route53_record.site_a.name == "recipes.example.com"
    error_message = "the domain has A and AAAA aliases"
  }

  assert {
    condition     = alltrue([for a in aws_route53_record.site_a.alias : a.zone_id == "Z2FDTNDATAQYW2"]) && alltrue([for a in aws_route53_record.site_aaaa.alias : a.zone_id == "Z2FDTNDATAQYW2"])
    error_message = "aliases target the CloudFront hosted zone"
  }

  assert {
    condition     = aws_route53_record.origin.name == "origin.recipes.example.com" && aws_route53_record.origin.type == "A" && contains(aws_route53_record.origin.records, aws_eip.origin.public_ip)
    error_message = "origin.<domain> points at the Elastic IP"
  }
}

run "outputs_exist_and_hide_the_secret" {
  command = plan

  assert {
    condition     = output.name_servers != null && output.distribution_domain_name != null
    error_message = "name_servers and distribution_domain_name outputs must exist"
  }

  assert {
    condition     = !strcontains(jsonencode([output.name_servers, output.origin_ip, output.distribution_domain_name]), random_password.origin_secret.result)
    error_message = "no output may contain the origin secret"
  }
}

run "origin_errors_are_not_cached" {
  command = plan

  assert {
    condition     = length(aws_cloudfront_distribution.main.custom_error_response) == 6
    error_message = "one custom_error_response per origin error code"
  }

  assert {
    condition = alltrue([
      toset([for r in aws_cloudfront_distribution.main.custom_error_response : r.error_code]) == toset([403, 404, 500, 502, 503, 504]),
      alltrue([for r in aws_cloudfront_distribution.main.custom_error_response : r.error_caching_min_ttl == 0 && r.response_page_path == null]),
    ])
    error_message = "403, 404, 500, 502, 503 and 504 must have error_caching_min_ttl 0 and no custom page"
  }
}
