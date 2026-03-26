export type BulkFailureDetail = {
  applicationId: number;
  error?: string;
};

type FailureLookupApplication = {
  id: number;
  name?: string | null;
  email?: string | null;
};

export function describeBulkFailures(
  failures: BulkFailureDetail[],
  applications: FailureLookupApplication[],
  fallbackLabel = "candidate",
) {
  if (failures.length === 0) {
    return "";
  }

  const lookup = new Map(
    applications.map((application) => [
      application.id,
      application.name || application.email || `Application ${application.id}`,
    ]),
  );

  const preview = failures.slice(0, 3).map((failure) => {
    const label = lookup.get(failure.applicationId) || `${fallbackLabel} ${failure.applicationId}`;
    return failure.error ? `${label} (${failure.error})` : label;
  });
  const remainder = failures.length - preview.length;

  return remainder > 0
    ? `${preview.join(", ")} and ${remainder} more`
    : preview.join(", ");
}
