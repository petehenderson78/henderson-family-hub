export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  created_at: string;
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
