#!/usr/bin/env python3
"""
Split the combined migration into small chunks that are safe to paste one at a
time.

Naive line-based splitting would cut through a $$ ... $$ function body and
produce syntax errors, so this parser tracks:
  - dollar-quoted blocks ($$)
  - line comments (--)
  - block comments (/* */)
  - single-quoted string literals

A chunk boundary is only ever placed after a top-level ';'.
"""
import pathlib, sys

MAX_LINES = int(sys.argv[1]) if len(sys.argv) > 1 else 90
SRC = pathlib.Path('dist/PHASE1_ALL.sql')
OUT = pathlib.Path('dist/chunks')

src = SRC.read_text()

statements, buf = [], []
i, n = 0, len(src)
in_dollar = in_line_c = in_block_c = in_str = False

while i < n:
    ch = src[i]
    two = src[i:i+2]

    if in_line_c:
        buf.append(ch)
        if ch == '\n':
            in_line_c = False
        i += 1; continue

    if in_block_c:
        buf.append(ch)
        if two == '*/':
            buf.append(src[i+1]); in_block_c = False; i += 2; continue
        i += 1; continue

    if in_dollar:
        if two == '$$':
            buf.append(two); in_dollar = False; i += 2; continue
        buf.append(ch); i += 1; continue

    if in_str:
        buf.append(ch)
        if ch == "'":
            if src[i+1:i+2] == "'":       # escaped quote
                buf.append("'"); i += 2; continue
            in_str = False
        i += 1; continue

    # not inside anything special
    if two == '--':
        in_line_c = True; buf.append(two); i += 2; continue
    if two == '/*':
        in_block_c = True; buf.append(two); i += 2; continue
    if two == '$$':
        in_dollar = True; buf.append(two); i += 2; continue
    if ch == "'":
        in_str = True; buf.append(ch); i += 1; continue
    if ch == ';':
        buf.append(ch)
        statements.append(''.join(buf).strip())
        buf = []; i += 1; continue

    buf.append(ch); i += 1

tail = ''.join(buf).strip()
if tail:
    statements.append(tail)

statements = [s for s in statements if s and not all(
    l.strip().startswith('--') or not l.strip() for l in s.splitlines())]

# Group into chunks
chunks, cur, cur_lines = [], [], 0
for st in statements:
    ln = st.count('\n') + 2
    if cur and cur_lines + ln > MAX_LINES:
        chunks.append(cur); cur, cur_lines = [], 0
    cur.append(st); cur_lines += ln
if cur:
    chunks.append(cur)

OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.sql'):
    f.unlink()

total = len(chunks)
for idx, ch in enumerate(chunks, 1):
    body = '\n\n'.join(ch)
    header = (
        f"-- ============================================================\n"
        f"-- YAKOUB BIG BOSS — Phase 1 · CHUNK {idx} of {total}\n"
        f"-- Run in order. Do not skip. Do not reorder.\n"
        f"-- ============================================================\n\n"
    )
    footer = f"\n\nselect 'chunk {idx}/{total} OK' as status;\n"
    (OUT / f"{idx:02d}.sql").write_text(header + body + footer)

print(f"statements : {len(statements)}")
print(f"chunks     : {total}  (max {MAX_LINES} lines each)")
print(f"largest    : {max(len(c.splitlines()) for c in [(OUT/f'{i:02d}.sql').read_text() for i in range(1,total+1)])} lines")
for i in range(1, total+1):
    t = (OUT/f'{i:02d}.sql').read_text()
    bad = t.count('$$') % 2
    if bad:
        print(f"  !! chunk {i:02d} has unbalanced $$")
print("dollar-quote balance: OK" if all((OUT/f'{i:02d}.sql').read_text().count('$$') % 2 == 0
      for i in range(1, total+1)) else "FAIL")
