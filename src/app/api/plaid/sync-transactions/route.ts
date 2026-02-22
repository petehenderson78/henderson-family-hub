import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { mapPlaidCategory } from "@/lib/plaid-category-map";

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.development,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  })
);

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: plaidItems } = await supabase
      .from("plaid_items")
      .select("id, access_token, sync_cursor")
      .eq("user_id", user.id);

    if (!plaidItems || plaidItems.length === 0) {
      return NextResponse.json({ added: 0, modified: 0, removed: 0 });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const item of plaidItems) {
      let cursor = item.sync_cursor || "";
      let hasMore = true;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor: cursor || undefined,
        });

        const { added, modified, removed, next_cursor, has_more } = response.data;

        // Process added transactions
        for (const txn of added) {
          if (txn.pending) continue;
          if (txn.amount <= 0) continue; // skip income/refunds (Plaid: positive = money out)

          const category = mapPlaidCategory(
            txn.personal_finance_category?.primary ?? "",
            txn.personal_finance_category?.detailed ?? ""
          );

          const { error } = await supabase
            .from("expenses")
            .upsert(
              {
                user_id: user.id,
                amount: txn.amount,
                category,
                description: txn.merchant_name ?? txn.name,
                date: txn.date,
                plaid_transaction_id: txn.transaction_id,
              },
              { onConflict: "plaid_transaction_id" }
            );

          if (!error) totalAdded++;
        }

        // Process modified transactions
        for (const txn of modified) {
          if (txn.pending) continue;

          if (txn.amount <= 0) {
            // Was an expense, now income/refund — remove it
            const { data: deleted } = await supabase
              .from("expenses")
              .delete()
              .eq("plaid_transaction_id", txn.transaction_id)
              .select("id");
            if (deleted && deleted.length > 0) totalRemoved++;
            continue;
          }

          const category = mapPlaidCategory(
            txn.personal_finance_category?.primary ?? "",
            txn.personal_finance_category?.detailed ?? ""
          );

          const { error } = await supabase
            .from("expenses")
            .update({
              amount: txn.amount,
              category,
              description: txn.merchant_name ?? txn.name,
              date: txn.date,
            })
            .eq("plaid_transaction_id", txn.transaction_id);

          if (!error) totalModified++;
        }

        // Process removed transactions
        for (const txn of removed) {
          const { data: deleted } = await supabase
            .from("expenses")
            .delete()
            .eq("plaid_transaction_id", txn.transaction_id)
            .select("id");
          if (deleted && deleted.length > 0) totalRemoved++;
        }

        cursor = next_cursor;
        hasMore = has_more;
      }

      // Persist cursor
      await supabase
        .from("plaid_items")
        .update({ sync_cursor: cursor })
        .eq("id", item.id);
    }

    return NextResponse.json({
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
