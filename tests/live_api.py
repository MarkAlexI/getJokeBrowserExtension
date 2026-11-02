"""Optional live JokeAPI check using production URL generation and validation."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CASES = [('en', 'Programming'), ('en', 'Pun'), ('en', 'Spooky'), ('en', 'Dark'), ('cs', 'Pun'), ('de', 'Spooky'), ('es', 'Misc'), ('fr', 'Dark')]
preferences = [{'lang': lang, 'joketypes': 'safe', 'categories': [category]} for lang, category in CASES]
generate = "const c=require('./scripts/core.js');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(p=>({preferences:c.normalizePreferences(p),url:c.buildJokeUrl(p)}))));"
queries = json.loads(subprocess.check_output(['node', '-e', generate, json.dumps(preferences)], cwd=ROOT))


def probe(query):
    with urllib.request.urlopen(query['url'], timeout=20) as response:
        data = json.load(response)
    assert data.get('error') is False, data
    return {**query, 'response': data}


with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(probe, queries))
validate = "const c=require('./scripts/core.js');for(const r of JSON.parse(process.argv[1]))c.validateJoke(r.response,r.preferences);"
subprocess.run(['node', '-e', validate, json.dumps(results)], cwd=ROOT, check=True)
report = {'pass': True, 'scope': 'Real HTTP requests with production buildJokeUrl and validateJoke', 'results': []}
for item in results:
    joke = item['response']
    report['results'].append({k: v for k, v in item.items() if k != 'response'} | {k: joke[k] for k in ['category', 'safe', 'flags', 'id']})
(ROOT / 'test-results').mkdir(exist_ok=True)
(ROOT / 'test-results/live-api.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(str(len(results)) + ' live JokeAPI requests passed production validation')
