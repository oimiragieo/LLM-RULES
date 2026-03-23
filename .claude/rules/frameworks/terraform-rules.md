# Terraform Development Standards

## Module Structure

- Organize code into reusable modules under `modules/`: `modules/vpc/`, `modules/rds/`, `modules/ecs/`
- Each module must have: `main.tf`, `variables.tf`, `outputs.tf`, and `README.md`
- Root modules (environments) live in `environments/staging/`, `environments/production/`
- Pin module versions when sourcing from registry: `version = "~> 4.0"` — never use `latest`
- Keep module interfaces small: expose only variables callers need, use locals for internal wiring

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.vpc_name
  cidr = var.vpc_cidr
}
```

## State Management

- Always use remote state backends (S3 + DynamoDB, Azure Blob, GCS) — never commit `.tfstate` files
- Enable state locking — S3 backend requires DynamoDB table; never skip locking in production
- Use `terraform_remote_state` data source to share outputs across state files (monorepo split-state)
- Never edit `.tfstate` files manually — use `terraform state mv`, `terraform state rm`, or `terraform import`
- Separate state files per environment — one state file per logical deployment unit

```hcl
terraform {
  backend "s3" {
    bucket         = "my-tf-state"
    key            = "prod/vpc/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tf-state-lock"
    encrypt        = true
  }
}
```

## Variables and Outputs

- Declare all variables with `type`, `description`, and `default` (or mark required by omitting `default`)
- Use `sensitive = true` for secrets: passwords, API keys, connection strings
- Validate variable values with `validation` blocks — catch bad inputs at plan time, not apply
- Export useful outputs from every module; downstream modules and humans need them
- Never hardcode environment names, account IDs, or region strings — use variables

```hcl
variable "db_password" {
  type        = string
  description = "RDS master password"
  sensitive   = true
}

variable "instance_count" {
  type    = number
  default = 2
  validation {
    condition     = var.instance_count >= 1
    error_message = "Must have at least one instance."
  }
}
```

## Security

- Store secrets in AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault — never in `.tfvars` files committed to VCS
- Use `data "aws_secretsmanager_secret_version"` to retrieve secrets at apply time
- Apply IAM least-privilege to the Terraform execution role — it should not have `*:*` permissions
- Enable encryption at rest and in transit for all stateful resources (RDS, S3, EBS)
- Use `prevent_destroy = true` lifecycle rule on production data stores to block accidental deletion

```hcl
lifecycle {
  prevent_destroy = true
}
```

## Workspace and Environment Patterns

- Use Terraform workspaces for lightweight environment separation: `terraform workspace new staging`
- For complex multi-environment setups, prefer separate directories over workspaces (clearer isolation)
- Use `terraform.workspace` in resource names to namespace resources: `"${terraform.workspace}-db"`
- Never run `terraform apply` without a saved plan in CI: `terraform plan -out=tfplan && terraform apply tfplan`
- Tag all resources with: `environment`, `owner`, `cost-center`, `managed-by = "terraform"`

## Anti-Patterns

- Never use `terraform apply -auto-approve` in production pipelines without explicit plan review
- Never hardcode credentials in `.tf` files or `.tfvars` — use environment variables or secrets manager references
- Never use `count` for resources with different configurations — use `for_each` with a map instead
- Never ignore plan diffs with `# tflint-ignore` or `#checkov:skip` without a documented justification
- Never skip `terraform fmt` and `terraform validate` in CI — formatting and syntax errors must fail the pipeline

## Linting and Validation

- `terraform fmt -recursive` — format all files before committing
- `terraform validate` — validate configuration syntax
- `tflint` — lint for provider-specific best practices
- `checkov` or `tfsec` — security scanning for misconfigurations
- `terraform plan` in CI — always review before apply

## When to invoke

`Skill({ skill: "terraform-infra" })` for Terraform module design, state management, and cloud infrastructure patterns
