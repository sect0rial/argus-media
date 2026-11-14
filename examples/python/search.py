"""Search adverse media on one name with the Media Terminal API and print the risk and the articles.

    pip install requests
    export MEDIA_API_KEY=...         # free key: https://media.unbackoffice.com/key (work Google account)
    python search.py "Jane Example" --kind person --country GB --context "CEO, Example Trading Ltd"
"""
import argparse
import json
import os
import sys

import requests

BASE_URL = os.environ.get("MEDIA_API_URL", "https://media.unbackoffice.com").rstrip("/")


def main() -> int:
    p = argparse.ArgumentParser(description="Search adverse media on one name.")
    p.add_argument("name")
    p.add_argument("--kind", choices=["person", "company", "vessel", "port"])
    p.add_argument("--country", help="country name or ISO code")
    p.add_argument("--dob", help="date of birth, YYYY-MM-DD")
    p.add_argument("--context", help="role, employer, city, IMO number...")
    args = p.parse_args()

    key = os.environ.get("MEDIA_API_KEY")
    if not key:
        print("Set MEDIA_API_KEY. Get a free key at https://media.unbackoffice.com/key", file=sys.stderr)
        return 2

    body = {k: v for k, v in vars(args).items() if v}
    r = requests.post(f"{BASE_URL}/v1/adverse-media", json=body, headers={"X-API-Key": key}, timeout=120)
    if not r.ok:
        try:
            detail = r.json().get("detail")
        except ValueError:
            detail = r.text
        print(f"HTTP {r.status_code}: {json.dumps(detail)}", file=sys.stderr)
        return 1

    res = r.json()
    o = res.get("overall") or {}
    print(f"risk:        {o.get('risk')}  (adverse hit: {o.get('adverse_hit')})")
    print(f"typologies:  {', '.join(o.get('typology_labels') or []) or '-'}")
    print(f"articles:    {res.get('articles_reviewed')} read  (searched {res.get('screened_at')})")
    print(f"why:         {o.get('rationale')}")
    for h in res.get("hits", [])[:10]:
        print(f"  [{h.get('severity')}] {h.get('date')}  {h.get('headline')}  {h.get('url')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
