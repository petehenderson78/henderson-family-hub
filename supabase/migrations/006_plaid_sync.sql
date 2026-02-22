ALTER TABLE plaid_items ADD COLUMN sync_cursor text NOT NULL DEFAULT '';
ALTER TABLE expenses ADD COLUMN plaid_transaction_id text UNIQUE;
CREATE INDEX idx_expenses_plaid_transaction_id
  ON expenses (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;
