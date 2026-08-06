#!/usr/bin/env python3
"""
Static consistency checks for the SQL migrations.

This does NOT replace running the migrations against a real PostgreSQL instance.
It catches the class of errors that is expensive to discover at deploy time:
references to tables or functions that were never created, tables missing from
the RLS list, and unbalanced dollar-quoted bodies.
"""
import re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SEED = sorted((ROOT / "supabase" / "seed").glob("*.sql"))

errors, warnings = [], []

# Files are applied in filename order; the fallback file is opt-in and skipped.
files = [f for f in MIG if "fallback" not in f.name]
combined = ""
created_tables, created_funcs = [], []
per_file = {}

for f in files:
    src = f.read_text()
    per_file[f.name] = src
    combined += f"\n-- FILE {f.name}\n" + src

    if src.count("$$") % 2 != 0:
        errors.append(f"{f.name}: unbalanced $$ ({src.count('$$')} occurrences)")

    created_tables += re.findall(r"create table (?:if not exists )?public\.(\w+)", src)
    created_funcs  += re.findall(r"create or replace function (app|public)\.(\w+)", src)

funcs = {f"{s}.{n}" for s, n in created_funcs}
tables = created_tables

# 1. Duplicate table definitions
dupes = [t for t, c in collections.Counter(tables).items() if c > 1]
if dupes:
    errors.append(f"Tables created more than once: {dupes}")

# 2. Every REFERENCES target must exist, and must be created BEFORE it is used
order = {}
for f in files:
    for t in re.findall(r"create table (?:if not exists )?public\.(\w+)", per_file[f.name]):
        order[t] = f.name

for f in files:
    src = per_file[f.name]
    for target in re.findall(r"references\s+public\.(\w+)\s*\(", src):
        if target not in tables:
            errors.append(f"{f.name}: references unknown table public.{target}")
        elif files.index(pathlib.Path(ROOT/'supabase'/'migrations'/order[target])) > files.index(f):
            errors.append(f"{f.name}: references public.{target} before it is created")

# auth.users is external to our migrations
if "references auth.users" not in combined:
    warnings.append("admin_users no longer references auth.users")

# 3. Every function called must be defined somewhere
called = set(re.findall(r"execute function (app|public)\.(\w+)\(", combined))
for schema, name in called:
    if f"{schema}.{name}" not in funcs:
        errors.append(f"trigger calls undefined function {schema}.{name}()")

# 4. Every created table must appear in the RLS enable list
rls_src = per_file.get("0011_rls.sql", "")
rls_block = re.search(r"foreach t in array array\[(.*?)\]", rls_src, re.S)
rls_tables = set(re.findall(r"'(\w+)'", rls_block.group(1))) if rls_block else set()
missing_rls = sorted(set(tables) - rls_tables)
if missing_rls:
    errors.append(f"Tables with no RLS enabled: {missing_rls}")
extra_rls = sorted(rls_tables - set(tables))
if extra_rls:
    errors.append(f"RLS list names non-existent tables: {extra_rls}")

# 5. Sensitive tables must never carry an anon policy
SENSITIVE = ["orders", "order_items", "order_timeline", "phone_blocklist",
             "order_submission_log", "audit_log", "admin_users",
             "stock_movements", "sheets_sync_queue"]
for t in SENSITIVE:
    for m in re.finditer(rf"create policy \w+ on public\.{t}\b(.*?);", rls_src, re.S):
        if "anon" in m.group(1):
            errors.append(f"SECURITY: public.{t} has a policy granting anon")

# 6. Seed files must only reference existing tables
for f in SEED:
    if "PENDING" in f.name:
        continue
    for target in re.findall(r"insert into public\.(\w+)", f.read_text()):
        if target not in tables:
            errors.append(f"{f.name}: seeds unknown table public.{target}")

print(f"Migration files : {len(files)}")
print(f"Tables created  : {len(tables)}")
print(f"Functions       : {len(funcs)}")
print(f"RLS-enabled     : {len(rls_tables)}")
print()
for w in warnings:
    print("WARN  ", w)
for e in errors:
    print("ERROR ", e)
print()
print("RESULT:", "PASS" if not errors else f"FAIL ({len(errors)} errors)")
sys.exit(1 if errors else 0)
