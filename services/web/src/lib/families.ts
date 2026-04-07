export const FREE_FAMILY_LIMIT = 5;

export function isFamilyLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("до 5 семей") ||
    (message.includes("лимит") && message.includes("сем"))
  );
}
