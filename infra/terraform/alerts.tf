# Operational alerts by email. The subscription stays "pending" until the owner clicks the confirmation link.
resource "aws_sns_topic" "alerts" {
  name = "ricettine-alerts"
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
