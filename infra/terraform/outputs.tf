output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.main.id
}

output "origin_ip" {
  description = "Elastic IP of the origin. origin.<domain> points at it."
  value       = aws_eip.origin.public_ip
}

output "media_bucket" {
  description = "Bucket holding recipe photos."
  value       = aws_s3_bucket.media.id
}

output "backups_bucket" {
  description = "Bucket holding database dumps."
  value       = aws_s3_bucket.backups.id
}

output "ssm_session_command" {
  description = "Opens a shell on the instance (there is no SSH)."
  value       = "aws ssm start-session --target ${aws_instance.main.id} --region ${var.region}"
}

output "name_servers" {
  description = "Set these as the custom nameservers at your registrar (first deploy, step 1)."
  value       = aws_route53_zone.main.name_servers
}

output "distribution_domain_name" {
  description = "The CloudFront address (the site's real URL is the domain)."
  value       = aws_cloudfront_distribution.main.domain_name
}
