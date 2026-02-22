-- Create recurring expenses table
CREATE TABLE recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  day_of_month integer NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track which months a recurring expense has been applied
CREATE TABLE recurring_expense_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id uuid REFERENCES recurring_expenses(id) ON DELETE CASCADE NOT NULL,
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  applied_month text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recurring_expense_id, applied_month)
);

-- Enable RLS
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expense_applications ENABLE ROW LEVEL SECURITY;

-- RLS policies for recurring_expenses
CREATE POLICY "Family members can view all recurring expenses"
  ON recurring_expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own recurring expenses"
  ON recurring_expenses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring expenses"
  ON recurring_expenses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring expenses"
  ON recurring_expenses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS policies for recurring_expense_applications
CREATE POLICY "Family members can view all recurring expense applications"
  ON recurring_expense_applications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert recurring expense applications"
  ON recurring_expense_applications FOR INSERT
  TO authenticated
  WITH CHECK (true);
