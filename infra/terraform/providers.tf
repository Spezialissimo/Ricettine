provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "ricettine"
      ManagedBy = "terraform"
    }
  }
}

# CloudFront certificates must live in us-east-1 (ACM, used from Task 11). Nothing else goes there.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "ricettine"
      ManagedBy = "terraform"
    }
  }
}
