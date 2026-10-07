#!/usr/bin/env python3
"""Import the legacy Querious/MySQL comics dump into a D1-compatible SQLite database.

The importer is deliberately conservative:
- legacy title IDs become `series.id`
- legacy issue rows become `variants.id`
- legacy value IDs become `holdings.id`
- logical issues are created only by grouping (series_id, number, type)
- no legacy variant row is deduplicated or discarded
- provider payloads are archived verbatim to gzip JSONL files for later R2 upload
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable, Iterator

TARGET_TABLES = {
    "audits",
    "boxes",
    "creators",
    "creator_issue",
    "issues",
    "publishers",
    "roles",
    "titles",
    "values",
}

# Column order follows the CREATE TABLE statements in the supplied dump.
COLUMNS = {
    "audits": ["id", "user_type", "user_id", "event", "auditable_type", "auditable_id", "old_values", "new_values", "url", "ip_address", "user_agent", "tags", "created_at", "updated_at"],
    "boxes": ["id", "type", "created_at", "updated_at"],
    "creators": ["id", "first_name", "last_name", "created_at", "updated_at", "name", "slug"],
    "creator_issue": ["id", "creator_id", "issue_id", "role", "created_at", "updated_at"],
    "issues": ["id", "zap_id", "comic_vine_id", "story_title", "variant", "number", "title_id", "publisher_id", "first_appearance_of", "details", "created_at", "updated_at", "response", "type"],
    "publishers": ["id", "name", "created_at", "updated_at"],
    "roles": ["id", "name", "category", "created_at", "updated_at"],
    "titles": ["id", "zap_id", "comic_vine_id", "name", "sort", "year", "created_at", "updated_at", "status"],
    "values": ["id", "issue_id", "condition", "price", "quantity", "box_id", "created_at", "updated_at"],
}

INSERT_RE = re.compile(r"^INSERT INTO `([^`]+)` VALUES\s*$")


def mysql_unescape(value: str) -> str:
    """Decode MySQL backslash escapes used in the dump without interpreting JSON unicode escapes."""
    out: list[str] = []
    i = 0
    mapping = {"0": "\0", "b": "\b", "n": "\n", "r": "\r", "t": "\t", "Z": "\x1a"}
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            if nxt in mapping:
                out.append(mapping[nxt])
            elif nxt in ("\\", "'", '"'):
                out.append(nxt)
            else:
                # MySQL treats backslash before an otherwise ordinary char as that char.
                # This matters for JSON strings such as escaped slashes.
                out.append(nxt)
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def convert_token(token: str, quoted: bool) -> Any:
    if quoted:
        return mysql_unescape(token)
    token = token.strip()
    if token.upper() == "NULL":
        return None
    if token == "":
        return ""
    # Keep numeric lexical forms until field-specific conversion; IDs become ints below.
    return token


def parse_rows(payload: str) -> Iterator[list[Any]]:
    """Parse `(a,'b',NULL),(...)` without using eval or a SQL server."""
    i = 0
    n = len(payload)
    while i < n:
        while i < n and payload[i] in " \t\r\n,;":
            i += 1
        if i >= n:
            return
        if payload[i] != "(":
            raise ValueError(f"Expected '(' at offset {i}, got {payload[i:i+20]!r}")
        i += 1
        row: list[Any] = []
        while True:
            while i < n and payload[i].isspace():
                i += 1
            if i >= n:
                raise ValueError("Unexpected EOF inside row")
            if payload[i] == "'":
                i += 1
                chars: list[str] = []
                while i < n:
                    ch = payload[i]
                    if ch == "\\" and i + 1 < n:
                        chars.append(ch)
                        chars.append(payload[i + 1])
                        i += 2
                        continue
                    if ch == "'":
                        i += 1
                        break
                    chars.append(ch)
                    i += 1
                value = convert_token("".join(chars), quoted=True)
            else:
                start = i
                while i < n and payload[i] not in ",)":
                    i += 1
                value = convert_token(payload[start:i], quoted=False)
            row.append(value)
            while i < n and payload[i].isspace():
                i += 1
            if i >= n:
                raise ValueError("Unexpected EOF after field")
            if payload[i] == ",":
                i += 1
                continue
            if payload[i] == ")":
                i += 1
                break
            raise ValueError(f"Expected ',' or ')' at offset {i}")
        yield row


def iter_insert_batches(sql_path: Path) -> Iterator[tuple[str, str]]:
    with sql_path.open("r", encoding="utf-8") as fh:
        table: str | None = None
        buf: list[str] = []
        for line in fh:
            if table is None:
                match = INSERT_RE.match(line.rstrip("\n"))
                if match:
                    candidate = match.group(1)
                    if candidate in TARGET_TABLES:
                        table = candidate
                        buf = []
                continue
            buf.append(line)
            if line.rstrip().endswith(";"):
                yield table, "".join(buf)
                table = None
                buf = []
        if table is not None:
            raise ValueError(f"Unterminated INSERT for {table}")


def read_legacy(sql_path: Path) -> dict[str, list[dict[str, Any]]]:
    data: dict[str, list[dict[str, Any]]] = {t: [] for t in TARGET_TABLES}
    for table, payload in iter_insert_batches(sql_path):
        columns = COLUMNS[table]
        for row in parse_rows(payload):
            if len(row) != len(columns):
                raise ValueError(f"{table}: expected {len(columns)} columns, got {len(row)}")
            data[table].append(dict(zip(columns, row)))
    return data


def as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def money_to_cents(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        dec = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return int(dec * 100)


def grade_to_tenths(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        dec = Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return int(dec * 10)


def extract_cover_price_cents(response: str | None) -> int | None:
    if not response:
        return None
    # Works for both the later normalized wrapper and raw JSON payloads.
    match = re.search(r'"cover_price"\s*:\s*(null|-?\d+(?:\.\d+)?)', response)
    if not match or match.group(1) == "null":
        return None
    return money_to_cents(match.group(1))


def provider_for_issue(issue: dict[str, Any]) -> str:
    response = issue.get("response") or ""
    if '"source":"vine"' in response or (issue.get("comic_vine_id") and not issue.get("zap_id")):
        return "comic_vine"
    if '"source":"zap"' in response or issue.get("zap_id"):
        return "zap"
    return "legacy"


def archive_payloads(issues: Iterable[dict[str, Any]], archive_dir: Path) -> Counter:
    archive_dir.mkdir(parents=True, exist_ok=True)
    handles: dict[str, Any] = {}
    counts: Counter = Counter()
    try:
        for issue in issues:
            response = issue.get("response")
            if response in (None, ""):
                continue
            provider = provider_for_issue(issue)
            if provider not in handles:
                handles[provider] = gzip.open(archive_dir / f"{provider}.jsonl.gz", "wt", encoding="utf-8")
            record = {
                "legacy_issue_id": as_int(issue["id"]),
                "zap_id": as_int(issue.get("zap_id")),
                "comic_vine_id": issue.get("comic_vine_id"),
                "response_raw": response,
            }
            handles[provider].write(json.dumps(record, ensure_ascii=False) + "\n")
            counts[provider] += 1
    finally:
        for handle in handles.values():
            handle.close()
    return counts


def import_data(
    data: dict[str, list[dict[str, Any]]],
    db_path: Path,
    schema_path: Path,
    valuation_schema_path: Path,
    provider_check_schema_path: Path,
    archive_dir: Path,
) -> dict[str, Any]:
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_path.read_text(encoding="utf-8"))

    with conn:
        # Dimension tables retain legacy IDs.
        conn.executemany(
            "INSERT INTO publishers(id,name,created_at,updated_at) VALUES (?,?,?,?)",
            [(as_int(r["id"]), r["name"], r["created_at"], r["updated_at"]) for r in data["publishers"]],
        )
        conn.executemany(
            "INSERT INTO creators(id,name,first_name,last_name,slug,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            [(as_int(r["id"]), r["name"], r["first_name"], r["last_name"], r["slug"], r["created_at"], r["updated_at"]) for r in data["creators"]],
        )
        conn.executemany(
            "INSERT INTO boxes(id,type,label,created_at,updated_at) VALUES (?,?,?,?,?)",
            [(as_int(r["id"]), r["type"], None, r["created_at"], r["updated_at"]) for r in data["boxes"]],
        )
        conn.executemany(
            "INSERT INTO series(id,name,sort_name,start_year,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            [(as_int(r["id"]), r["name"], r["sort"], as_int(r["year"]), r["status"] or "ended", r["created_at"], r["updated_at"]) for r in data["titles"]],
        )

        # Deterministic logical issue IDs, ordered by legacy series/issue appearance.
        issue_groups: dict[tuple[int, str, str], int] = {}
        next_issue_id = 1
        for row in sorted(data["issues"], key=lambda r: as_int(r["id"]) or 0):
            key = (as_int(row["title_id"]), str(row["number"] or ""), str(row["type"] or "issue"))
            if key not in issue_groups:
                issue_groups[key] = next_issue_id
                conn.execute(
                    "INSERT INTO issues(id,series_id,number,type,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                    (next_issue_id, key[0], key[1], key[2], row["created_at"], row["updated_at"]),
                )
                next_issue_id += 1

        for row in data["issues"]:
            legacy_issue_id = as_int(row["id"])
            key = (as_int(row["title_id"]), str(row["number"] or ""), str(row["type"] or "issue"))
            zap_id = as_int(row.get("zap_id"))
            cv_id = row.get("comic_vine_id")
            image_key = f"{zap_id}.jpg" if zap_id is not None else (f"{cv_id}.jpg" if cv_id else None)
            conn.execute(
                """INSERT INTO variants(
                    id,issue_id,publisher_id,name,story_title,first_appearance_of,details,
                    cover_price_cents,image_key,created_at,updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    legacy_issue_id,
                    issue_groups[key],
                    as_int(row.get("publisher_id")),
                    row.get("variant") or "",
                    row.get("story_title"),
                    row.get("first_appearance_of"),
                    row.get("details"),
                    extract_cover_price_cents(row.get("response")),
                    image_key,
                    row.get("created_at"),
                    row.get("updated_at"),
                ),
            )
            if zap_id is not None:
                conn.execute(
                    "INSERT INTO external_refs(entity_type,entity_id,provider,external_id,created_at) VALUES ('variant',?,?,?,?)",
                    (legacy_issue_id, "zap", str(zap_id), row.get("created_at")),
                )
            if cv_id:
                conn.execute(
                    "INSERT INTO external_refs(entity_type,entity_id,provider,external_id,created_at) VALUES ('variant',?,?,?,?)",
                    (legacy_issue_id, "comic_vine", str(cv_id), row.get("created_at")),
                )

        # Series provider IDs.
        for row in data["titles"]:
            series_id = as_int(row["id"])
            if row.get("zap_id") not in (None, ""):
                conn.execute(
                    "INSERT INTO external_refs(entity_type,entity_id,provider,external_id,created_at) VALUES ('series',?,?,?,?)",
                    (series_id, "zap", str(as_int(row["zap_id"])), row.get("created_at")),
                )
            if row.get("comic_vine_id") not in (None, ""):
                conn.execute(
                    "INSERT INTO external_refs(entity_type,entity_id,provider,external_id,created_at) VALUES ('series',?,?,?,?)",
                    (series_id, "comic_vine", str(row["comic_vine_id"]), row.get("created_at")),
                )

        conn.executemany(
            "INSERT INTO holdings(id,variant_id,grade_tenths,quantity,box_id,current_value_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            [
                (
                    as_int(r["id"]),
                    as_int(r["issue_id"]),
                    grade_to_tenths(r["condition"]),
                    as_int(r["quantity"]) or 0,
                    (None if as_int(r["box_id"]) in (None, 0) else as_int(r["box_id"])),
                    money_to_cents(r["price"]),
                    r["created_at"],
                    r["updated_at"],
                )
                for r in data["values"]
            ],
        )

        conn.executemany(
            "INSERT INTO variant_credits(id,variant_id,creator_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)",
            [
                (as_int(r["id"]), as_int(r["issue_id"]), as_int(r["creator_id"]), r["role"], r["created_at"], r["updated_at"])
                for r in data["creator_issue"]
            ],
        )

        # Recover source-supported Zap price observations from console audits.
        # Events targeting deleted legacy holdings cannot satisfy a current FK, so those
        # are retained in the external legacy event archive instead of being discarded.
        price_events_total = 0
        price_events_attached = 0
        price_events_orphaned = 0
        audit_parse_errors = 0
        price_event_archive: list[dict[str, Any]] = []
        for audit in data["audits"]:
            if audit.get("auditable_type") != "App\\Value" or audit.get("event") != "updated" or audit.get("url") != "console":
                continue
            try:
                old_values = json.loads(audit.get("old_values") or "{}")
                new_values = json.loads(audit.get("new_values") or "{}")
            except json.JSONDecodeError:
                audit_parse_errors += 1
                continue
            if "price" not in new_values:
                continue
            price_events_total += 1
            price_cents = money_to_cents(new_values["price"])
            holding_id = as_int(audit.get("auditable_id"))
            observed_at = audit.get("updated_at") or audit.get("created_at")
            exists = bool(conn.execute("SELECT 1 FROM holdings WHERE id=?", (holding_id,)).fetchone())
            price_event_archive.append({
                "audit_id": as_int(audit["id"]),
                "legacy_holding_id": holding_id,
                "old_price_cents": money_to_cents(old_values.get("price")),
                "new_price_cents": price_cents,
                "observed_at": observed_at,
                "attached_to_current_holding": exists,
            })
            if price_cents is None or not exists:
                if not exists:
                    price_events_orphaned += 1
                continue
            grade = conn.execute("SELECT grade_tenths FROM holdings WHERE id=?", (holding_id,)).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO price_snapshots(holding_id,provider,grade_tenths,price_cents,observed_at,source_event_id) VALUES (?,?,?,?,?,?)",
                (holding_id, "zap", grade, price_cents, observed_at, as_int(audit["id"])),
            )
            price_events_attached += 1

        # Phase 7 adds the explicit current-valuation model after legacy holdings
        # and recovered price snapshots exist, so the migration can seed them.
        conn.executescript(valuation_schema_path.read_text(encoding="utf-8"))
        conn.executescript(provider_check_schema_path.read_text(encoding="utf-8"))
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        conn.executemany(
            "INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES (?, datetime('now'))",
            [
                (schema_path.name,),
                (valuation_schema_path.name,),
                (provider_check_schema_path.name,),
            ],
        )

        metadata = {
            "source_dump": str(sql_path_global.name),
            "migration_strategy": "legacy IDs retained for series/variants/holdings; logical issues grouped by series+number+type",
        }
        conn.executemany("INSERT INTO import_metadata(key,value) VALUES (?,?)", metadata.items())

    payload_counts = archive_payloads(data["issues"], archive_dir)
    archive_dir.mkdir(parents=True, exist_ok=True)
    with gzip.open(archive_dir / "legacy-price-events.jsonl.gz", "wt", encoding="utf-8") as fh:
        for event in price_event_archive:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")

    report = reconcile(conn, data)
    report["payload_archive_counts"] = dict(payload_counts)
    report["audit_price_events_total"] = price_events_total
    report["audit_price_events_attached"] = price_events_attached
    report["audit_price_events_orphaned"] = price_events_orphaned
    report["audit_json_parse_errors"] = audit_parse_errors
    conn.close()
    return report


def reconcile(conn: sqlite3.Connection, data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    def scalar(sql: str) -> Any:
        return conn.execute(sql).fetchone()[0]

    legacy_quantity = sum(as_int(r["quantity"]) or 0 for r in data["values"])
    legacy_value_cents = sum((money_to_cents(r["price"]) or 0) * (as_int(r["quantity"]) or 0) for r in data["values"])
    legacy_refs_zap_variants = sum(1 for r in data["issues"] if r.get("zap_id") not in (None, ""))
    legacy_refs_vine_variants = sum(1 for r in data["issues"] if r.get("comic_vine_id") not in (None, ""))

    checks = {
        "series": (len(data["titles"]), scalar("SELECT COUNT(*) FROM series")),
        "legacy_variant_rows": (len(data["issues"]), scalar("SELECT COUNT(*) FROM variants")),
        "holdings": (len(data["values"]), scalar("SELECT COUNT(*) FROM holdings")),
        "physical_quantity": (legacy_quantity, scalar("SELECT COALESCE(SUM(quantity),0) FROM holdings")),
        "boxes": (len(data["boxes"]), scalar("SELECT COUNT(*) FROM boxes")),
        "creator_credits": (len(data["creator_issue"]), scalar("SELECT COUNT(*) FROM variant_credits")),
        "publishers": (len(data["publishers"]), scalar("SELECT COUNT(*) FROM publishers")),
        "creators": (len(data["creators"]), scalar("SELECT COUNT(*) FROM creators")),
        "zap_variant_refs": (legacy_refs_zap_variants, scalar("SELECT COUNT(*) FROM external_refs WHERE entity_type='variant' AND provider='zap'")),
        "comic_vine_variant_refs": (legacy_refs_vine_variants, scalar("SELECT COUNT(*) FROM external_refs WHERE entity_type='variant' AND provider='comic_vine'")),
        "collection_value_cents": (legacy_value_cents, scalar("SELECT COALESCE(SUM(current_value_cents * quantity),0) FROM holdings")),
    }
    check_rows = {
        key: {"legacy": legacy, "new": new, "match": legacy == new}
        for key, (legacy, new) in checks.items()
    }
    return {
        "all_core_checks_pass": all(v["match"] for v in check_rows.values()),
        "checks": check_rows,
        "logical_issue_count": scalar("SELECT COUNT(*) FROM issues"),
        "variant_groups_with_multiple_covers": scalar("SELECT COUNT(*) FROM (SELECT issue_id FROM variants GROUP BY issue_id HAVING COUNT(*) > 1)"),
        "unboxed_holdings": scalar("SELECT COUNT(*) FROM holdings WHERE box_id IS NULL"),
        "missing_value_holdings": scalar("SELECT COUNT(*) FROM holdings WHERE current_value_cents IS NULL"),
        "zero_value_holdings": scalar("SELECT COUNT(*) FROM holdings WHERE current_value_cents = 0"),
        "price_snapshots_recovered": scalar("SELECT COUNT(*) FROM price_snapshots"),
        "current_valuations_seeded": scalar("SELECT COUNT(*) FROM current_valuations"),
        "foreign_key_violations": len(conn.execute("PRAGMA foreign_key_check").fetchall()),
        "integrity_check": conn.execute("PRAGMA integrity_check").fetchone()[0],
        "collection_value": f"{legacy_value_cents / 100:.2f}",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sql_dump", type=Path)
    parser.add_argument("--db", type=Path, default=Path("output/comics.d1.sqlite"))
    parser.add_argument("--schema", type=Path, default=Path("d1/migrations/0001_initial.sql"))
    parser.add_argument(
        "--valuation-schema",
        type=Path,
        default=Path("d1/migrations/0002_valuation_engine.sql"),
    )
    parser.add_argument(
        "--provider-check-schema",
        type=Path,
        default=Path("d1/migrations/0003_valuation_provider_checks.sql"),
    )
    parser.add_argument("--archive-dir", type=Path, default=Path("output/provider-payloads"))
    parser.add_argument("--report", type=Path, default=Path("output/reconciliation.json"))
    args = parser.parse_args()

    global sql_path_global
    sql_path_global = args.sql_dump

    data = read_legacy(args.sql_dump)
    args.db.parent.mkdir(parents=True, exist_ok=True)
    report = import_data(
        data,
        args.db,
        args.schema,
        args.valuation_schema,
        args.provider_check_schema,
        args.archive_dir,
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
