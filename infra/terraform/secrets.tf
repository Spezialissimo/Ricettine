# Generated once and kept in state (local, gitignored). The instance reads them from SSM on every boot,
# so they never appear in user-data. Alphanumeric only: the origin secret is matched literally in the Caddyfile.
resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/ricettine/postgres-password"
  type  = "SecureString"
  value = random_password.postgres.result
}

resource "aws_ssm_parameter" "origin_secret" {
  name  = "/ricettine/origin-secret"
  type  = "SecureString"
  value = random_password.origin_secret.result
}
