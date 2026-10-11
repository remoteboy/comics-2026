#!/usr/bin/env python3

import argparse
import sqlite3
from pathlib import Path

TABLES = [
    "publishers",
    "series",
    "issues",
    "variants",
    "boxes",
    "creators",
    "holdings",
    "variant_credits",
    "external_refs",
    "price_snapshots",
    "price_alerts",
    "sync_runs",
    "import_metadata",
    "current_valuations",
    "provider_price_checks",
    "sale_intelligence_settings",
    "sale_watch_state",
    "sold_comp_cache",
]


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return f"X'{value.hex()}'"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(
        description="Export local comics SQLite data as D1-compatible INSERT statements."
    )
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row

    with args.output.open("w", encoding="utf-8") as output:
        output.write("PRAGMA defer_foreign_keys = TRUE;\n")

        for table in TABLES:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
                (table,),
            ).fetchone()
            if not exists:
                continue

            columns = [
                row["name"]
                for row in connection.execute(f'PRAGMA table_info("{table}")')
            ]
            quoted_columns = ", ".join(f'"{column}"' for column in columns)

            for row in connection.execute(f'SELECT * FROM "{table}"'):
                values = ", ".join(sql_literal(row[column]) for column in columns)
                output.write(
                    f'INSERT OR REPLACE INTO "{table}" ({quoted_columns}) VALUES ({values});\n'
                )

    connection.close()
    print(f"Exported D1 data to {args.output}")


if __name__ == "__main__":
    main()
