-- Create budget goals table
CREATE TABLE budget_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  monthly_limit numeric NOT NULL CHECK (monthly_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category)
);

-- Enable RLS
ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;

-- RLS policies for budget_goals
CREATE POLICY "Family members can view all budget goals"
  ON budget_goals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own budget goals"
  ON budget_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budget goals"
  ON budget_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budget goals"
  ON budget_goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
