import postgres from "postgres";
import { backfillLegacyCollection } from "./lib/backfill-collection.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for the collection backfill.");

const sql = postgres(url, {
  max: 1,
  connect_timeout: 15,
  ssl: url.includes("sslmode=require") ? "require" : false,
  prepare: !url.includes("-pooler"),
  onnotice: () => {},
});

try {
  await backfillLegacyCollection((work) =>
    sql.begin(async (transaction) =>
      work(async (statement) => {
        await transaction.unsafe(statement);
      }),
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
