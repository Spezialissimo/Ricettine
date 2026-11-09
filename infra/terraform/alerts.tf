# Operational alerts by email. The subscription stays "pending" until the owner clicks the confirmation link.
resource "aws_sns_topic" "alerts" {
  name = "ricettine-alerts"
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Catches a backup that never ran (timer not enabled, host stopped, SNS publish failing), which the
# OnFailure= email cannot. No dump put for 26 hours, or no metric data at all, means ALARM.
# Right after the first apply it fires until the first dump lands: expected.
resource "aws_cloudwatch_metric_alarm" "backup_stale" {
  alarm_name          = "ricettine-backup-stale"
  alarm_description   = "No database dump was uploaded to db/ in the last 26 hours."
  namespace           = "AWS/S3"
  metric_name         = "PutRequests"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    BucketName = local.backups_bucket_name
    FilterId   = aws_s3_bucket_metric.backups_db.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}
