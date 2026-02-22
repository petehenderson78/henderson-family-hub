// Maps Plaid personal_finance_category.detailed to app categories
const DETAILED_OVERRIDES: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  TRANSPORTATION_PUBLIC_TRANSIT: "Other",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Other",
  TRANSPORTATION_PARKING: "Other",
  TRANSPORTATION_TOLLS: "Other",
};

// Maps Plaid personal_finance_category.primary to app categories
const PRIMARY_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "Dining Out",
  TRANSPORTATION: "Gas",
  GENERAL_MERCHANDISE: "Shopping",
  ENTERTAINMENT: "Entertainment",
  RECREATION: "Entertainment",
  RENT_AND_UTILITIES: "Bills",
  LOAN_PAYMENTS: "Bills",
  BANK_FEES: "Bills",
  MEDICAL: "Bills",
};

export function mapPlaidCategory(
  primary: string,
  detailed: string
): string {
  return DETAILED_OVERRIDES[detailed] ?? PRIMARY_MAP[primary] ?? "Other";
}
