# Scans every commit on every branch for secrets. Prints only masked values (first 4 + last 2 chars + length).
# Usage (repo root): python3 origin/automation-engine/tools/scan-secrets.py

import re, sys, subprocess, base64, json, collections
P = {
 'openrouter_key': r'sk-or-v1-[a-f0-9]{48,}',
 'openai_or_anthropic_key': r'sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_\-]{32,}',
 'github_token': r'gh[pousr]_[A-Za-z0-9]{36,}',
 'aws_access_key': r'AKIA[0-9A-Z]{16}',
 'google_api_key': r'AIza[0-9A-Za-z_\-]{35}',
 'stripe_live_secret': r'(?:sk|rk)_live_[0-9a-zA-Z]{20,}',
 'stripe_test_secret': r'sk_test_[0-9a-zA-Z]{20,}',
 'stripe_webhook_secret': r'whsec_[0-9a-zA-Z]{20,}',
 'slack_token': r'xox[baprs]-[0-9A-Za-z\-]{10,}',
 'meta_access_token': r'EAA[A-Za-z0-9]{60,}',
 'twilio_api_key': r'SK[0-9a-f]{32}',
 'sendgrid_key': r'SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}',
 'resend_key': r're_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}',
 'private_key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'db_url_with_password': r'postgres(?:ql)?://[^:\s/@\'"`]+:[^@\s\'"`]{6,}@[^\s\'"`]+',
 'jwt': r'eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}',
 'generic_assignment': r'(?i)(?:secret|passw(?:or)?d|api[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key)["\']?\s*[:=]\s*["\']([A-Za-z0-9/+_\-]{20,})["\']',
}
PLACEHOLDER = re.compile(r'(?i)(your|example|placeholder|changeme|xxx|<|\$\{|\{\{|dummy|test123|password@|user:pass|localhost|127\.0\.0\.1|postgres:postgres@|fake|redacted|\*\*\*)')
R = {k: re.compile(v) for k, v in P.items()}
def mask(s): return f"{s[:4]}…{s[-2:]} ({len(s)} chars)"
def jwt_role(t):
    try:
        p = t.split('.')[1]; p += '=' * (-len(p) % 4); d = json.loads(base64.urlsafe_b64decode(p))
        return f"role={d.get('role')} ref={d.get('ref', '?')}"
    except Exception: return 'undecodable'
proc = subprocess.Popen(['git', 'log', '--all', '-p', '--no-color', '--no-ext-diff', '-U0', '--format=COMMIT %h %ad', '--date=short'], stdout=subprocess.PIPE, text=True, errors='replace')
commit = file = None; hits = collections.OrderedDict()
for line in proc.stdout:
    if line.startswith('COMMIT '): commit = line.split()[1] + ' ' + line.split()[2]; continue
    if line.startswith('+++ '): file = line[6:].strip(); continue
    if not line.startswith('+') or line.startswith('+++'): continue
    if file and re.search(r'(package-lock\.json|\.lock$|\.svg$|\.min\.js$|/static/.*\.js$)', file): continue
    for name, rx in R.items():
        for m in rx.finditer(line):
            val = m.group(1) if m.groups() else m.group(0)
            if name in ('db_url_with_password', 'generic_assignment') and PLACEHOLDER.search(line): continue
            if name == 'generic_assignment' and re.fullmatch(r'[a-z_]+', val): continue
            key = (name, val)
            if key not in hits: hits[key] = {'first': commit, 'files': set(), 'n': 0}
            hits[key]['files'].add(file); hits[key]['n'] += 1
proc.wait()
by = collections.defaultdict(list)
for (name, val), h in hits.items(): by[name].append((val, h))
for name, items in by.items():
    print(f"\n== {name}: {len(items)} distinct value(s)")
    for val, h in items[:12]:
        extra = '  ' + jwt_role(val) if name == 'jwt' else ''
        in_main = subprocess.run(['git', 'grep', '-q', '-F', val, 'origin/main', '--'], capture_output=True).returncode == 0
        print(f"  {mask(val)}{extra} | first {h['first']} | in current main: {'YES' if in_main else 'no'} | {', '.join(sorted(h['files']))[:110]}")
    if len(items) > 12: print(f"  … {len(items) - 12} more")
