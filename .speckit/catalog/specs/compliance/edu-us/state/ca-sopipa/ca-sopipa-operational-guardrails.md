# California SOPIPA Operational Guardrails

California's Student Online Personal Information Protection Act (SOPIPA, Cal. Bus. & Prof. Code §22584) restricts how operators of K-12 online services use student data. This overlay highlights controls to align your platform with state expectations.

## Advertising and marketing restrictions

- Prohibit behaviorally targeted advertising on K-12 students when using data acquired through the service.
- Block third-party ad tracking scripts in student-facing contexts and log technical controls that enforce the prohibition.
- Confirm marketing teams cannot build lookalike audiences using covered student information.

## Profiling and secondary use

- Document how the service prevents creating student profiles for purposes other than K-12 school purposes.
- Limit analytics dashboards to educational performance insights and strip identifiers when creating aggregate reports.
- Review integrations to ensure vendors cannot use student data for non-educational data mining.

## Data sale and disclosure bans

- Maintain contracts that forbid the sale or rental of student information to third parties.
- Track any required disclosures (e.g., law enforcement) and document the legal basis for each release.
- Verify that directory or marketing exports exclude SOPIPA-protected data.

## Deletion on request

- Provide a workflow for schools or districts to request deletion of student data and confirm completion.
- Ensure deletion propagates to backups, logging, and support tooling.
- Record turnaround times and responsible teams for each deletion ticket.

## References

- California Legislature: SOPIPA (Cal. Bus. & Prof. Code §22584) (<https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=BPC&division=8.&title=&part=&chapter=22.&article=6.5.>)
- California Department of Justice — Student Data Privacy Guidance (<https://oag.ca.gov/edtech>)
