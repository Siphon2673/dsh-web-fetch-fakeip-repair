# Agent Instructions

## Accepted deployment scope and SSRF trade-off

- This plugin is only for **personal DSH deployments that are not exposed as a service**. Do not describe it as suitable for shared, multi-tenant, or publicly accessible DSH instances, or for deployments where untrusted callers can choose `web_fetch` URLs.
- In fake-IP mode, accepting fake-IP answers intentionally prevents DSH from validating the hostname's final destination behind the proxy. The resulting loss of DSH's final-destination SSRF protection is an **accepted consequence within the stated personal-use scope**, not an unresolved review finding.
- Do not repeatedly report that accepted SSRF trade-off itself as a defect, and do not restore the strict fake-IP rejection unless the user changes the requirement. Other correctness, reliability, lifecycle, compatibility, and repository issues must still be reported normally.
- Never claim that the original SSRF guarantees remain intact. If the deployment scope changes, or the instance becomes shared or externally accessible, call out that the accepted risk no longer applies and the plugin must be re-evaluated or disabled.

## Process documents

- Put review documents, audit notes, implementation/construction reports, verification records, and other work-process documents in **`.work/`**.
- Do not leave those process documents in the repository root or other tracked documentation locations. The root `.work/` directory is intentionally ignored by Git to prevent accidental upload to GitHub; do not force-add its contents.
- Durable user-facing project documentation, such as `README.md`, this file, and `LICENSE`, is not process documentation and must remain in its normal tracked location.
