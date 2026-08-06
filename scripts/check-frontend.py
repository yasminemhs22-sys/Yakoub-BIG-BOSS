#!/usr/bin/env python3
"""
Static checks for the frontend, for use where npm/tsc cannot run.

This does NOT replace `npm run typecheck` and `npm run build`. It catches the
errors that are cheap to find without a toolchain: unresolved imports, missing
translation keys, and secrets in client code.
"""
import re, pathlib, sys

SRC = pathlib.Path('src')
files = sorted(list(SRC.rglob('*.ts')) + list(SRC.rglob('*.tsx')))
errors = []

def strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'^\s*//.*$', '', text, flags=re.M)

def resolves(base: pathlib.Path, spec: str) -> bool:
    if spec.startswith('@/'):
        target = SRC / spec[2:]
    elif spec.startswith('.'):
        target = (base.parent / spec).resolve()
    else:
        return True
    return any(pathlib.Path(str(target) + ext).exists()
               for ext in ('', '.ts', '.tsx', '/index.ts', '/index.tsx', '.css'))

for f in files:
    text = f.read_text()
    for m in re.finditer(r"from\s+'([^']+)'|import\('([^']+)'\)|import\s+'([^']+)'", text):
        spec = m.group(1) or m.group(2) or m.group(3)
        if not resolves(f, spec):
            errors.append(f"{f}: unresolved import '{spec}'")

fr = pathlib.Path('src/i18n/locales/fr.ts').read_text()
ar = pathlib.Path('src/i18n/locales/ar.ts').read_text()
fr_keys = set(re.findall(r'^\s{4}(\w+):', fr, re.M))
ar_keys = set(re.findall(r'^\s{4}(\w+):', ar, re.M))
if fr_keys - ar_keys: errors.append(f"ar missing keys: {sorted(fr_keys - ar_keys)}")
if ar_keys - fr_keys: errors.append(f"ar extra keys: {sorted(ar_keys - fr_keys)}")

# Secrets in EXECUTABLE code only. A comment warning about service_role is the
# opposite of a leak, so comments are stripped before this check.
for f in files:
    code = strip_comments(f.read_text())
    for bad in ('service_role', 'SERVICE_ROLE_KEY', 'process.env'):
        if bad in code:
            errors.append(f"{f}: '{bad}' appears in executable code")

# Every locale must be reachable and the switch must preserve the path.
router = pathlib.Path('src/router/routes.tsx').read_text()
if '/:locale' not in router:
    errors.append('routes.tsx: no locale-prefixed route (D-099)')
if 'lazy(' not in router:
    errors.append('routes.tsx: admin is not lazily loaded (D-232)')

# React namespace used without importing it (jsx: react-jsx has no auto import)
for f in files:
    t = f.read_text()
    if re.search(r'\bReact\.', t) and not re.search(r"import\s+\*\s+as\s+React|import\s+React\b", t):
        errors.append(f"{f}: uses React.* without importing React")

# Admin dictionaries must stay in parity, like the storefront ones.
afr = pathlib.Path('src/i18n/locales/admin.fr.ts')
aar = pathlib.Path('src/i18n/locales/admin.ar.ts')
if afr.exists() and aar.exists():
    fk = set(re.findall(r'^\s{4}(\w+):', afr.read_text(), re.M))
    ak = set(re.findall(r'^\s{4}(\w+):', aar.read_text(), re.M))
    if fk - ak: errors.append(f"admin.ar missing keys: {sorted(fk - ak)}")
    if ak - fk: errors.append(f"admin.ar extra keys: {sorted(ak - fk)}")

# Storefront pages must never import admin code (D-232).
for f in files:
    if 'pages/storefront' in str(f):
        for m in re.finditer(r"from\s+'(@/(?:pages/admin|auth)/[^']+)'", f.read_text()):
            errors.append(f"{f}: storefront imports admin code '{m.group(1)}'")

# `as const` on a dictionary object freezes every value into a literal type,
# so no translation is assignable to it. Caught 93 errors the hard way once.
for name in ('src/i18n/locales/fr.ts', 'src/i18n/locales/admin.fr.ts'):
    f = pathlib.Path(name)
    if f.exists() and re.search(r'^\} as const;', f.read_text(), re.M):
        errors.append(f"{name}: dictionary uses `as const` — freezes values into literal types")

# The cart must never persist a price, name or total: only variant ids and
# quantities (D-273). A price in localStorage is a price the client can edit.
cart = pathlib.Path('src/lib/cart.ts')
if cart.exists():
    code = strip_comments(cart.read_text())
    for bad in ('price', 'total', 'name_fr', 'unitPrice'):
        if bad in code:
            errors.append(f"src/lib/cart.ts: stores '{bad}' — the cart must hold ids and quantities only")

# The client must not send monetary values to place_order.
co = pathlib.Path('src/lib/queries/checkout.ts')
if co.exists():
    code = strip_comments(co.read_text())
    import re as _re
    call = _re.search(r"rpc\('place_order',\s*\{(.*?)\}\)", code, _re.S)
    if call:
        body = call.group(1)
        for bad in ('p_total', 'p_subtotal', 'p_price', 'p_delivery_fee'):
            if bad in body:
                errors.append(f"place_order call sends '{bad}' — totals are server-side only (D-274)")

# Order state and stock must move only through the server RPCs (Phase 1).
# A direct .update({status_id}) or a write to stock_on_hand would bypass row
# locking, the transition table and the ledger.
for f in files:
    code = strip_comments(f.read_text())
    if re.search(r"\.update\(\s*\{[^}]*status_id", code):
        errors.append(f"{f}: writes status_id directly — use transition_order_status()")
    if re.search(r"\.update\(\s*\{[^}]*stock_on_hand", code):
        errors.append(f"{f}: writes stock_on_hand directly — post a stock_movement instead")

# Nothing under src/ may reference the Netlify functions directory: that is
# where the service-role key and Google credentials live (D-175).
for f in files:
    if re.search(r"from\s+'[^']*netlify/functions", f.read_text()):
        errors.append(f"{f}: imports from netlify/functions — server secrets must not enter the bundle")

fn = pathlib.Path('netlify/functions')
if fn.exists():
    for wf in fn.rglob('*.ts'):
        if 'VITE_' in strip_comments(wf.read_text()):
            errors.append(f"{wf}: uses a VITE_ variable — those are public; use the server names")

# Every dashboard nav entry must resolve to a route. A menu item with no route
# renders a 404 the moment it is clicked — found the hard way.
shell = pathlib.Path('src/pages/admin/AdminShell.tsx')
if shell.exists():
    nav = set(re.findall(r"\{ to: '([^']+)'", shell.read_text()))
    routed = set(re.findall(r"path: '([^']+)'", router))
    for entry in nav:
        first = entry.split('/')[0]
        if first not in routed:
            errors.append(f"AdminShell nav '{entry}' has no matching route -> 404 when clicked")

print(f"files scanned   : {len(files)}")
print(f"i18n keys       : fr {len(fr_keys)} / ar {len(ar_keys)}")
print(f"unresolved imps : {sum(1 for e in errors if 'unresolved' in e)}")
print()
for e in errors:
    print("ERROR", e)
print("RESULT:", "PASS" if not errors else f"FAIL ({len(errors)})")
sys.exit(1 if errors else 0)
