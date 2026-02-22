export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  created_at: string;
  plaid_transaction_id: string | null;
}

export interface Event {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
}

export interface CalendarFeed {
  id: string;
  user_id: string;
  name: string;
  url: string;
  color: string;
  created_at: string;
}

export interface ExternalEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  source: string;
  sourceColor: string;
  is_external: true;
}

export interface DiscoveredEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  source_email: string;
}

export interface RecurringExpense {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  category: string;
  day_of_month: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BudgetGoal {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  created_at: string;
}
