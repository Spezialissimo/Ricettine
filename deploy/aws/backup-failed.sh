#!/usr/bin/env bash
# Emails the owner (SNS topic) when ricettine-backup.service fails. Started by OnFailure= through
# ricettine-backup-failed.service; REGION and ALERT_TOPIC_ARN come from /opt/ricettine/config.env.
set -euo pipefail

host="$(hostname)"
message="$(journalctl -u ricettine-backup.service -n 20 --no-pager 2>&1 || true)"
aws sns publish --region "$REGION" --topic-arn "$ALERT_TOPIC_ARN" \
  --subject "Ricettine backup failed on $host" --message "${message:-no journal output}"
