"""Native packaged-extension smoke test. Python standard library + geckodriver."""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'manifest.json').read_text())['version']
ADDON_ID = '{d9b8e5c3-3c54-4f6a-bf91-6a4b80d8e978}'
UUID = '1c650f2c-8413-4d96-a463-663fe6d948d9'
DRIVER = os.environ.get('GECKODRIVER') or shutil.which('geckodriver')
if not DRIVER:
    raise SystemExit('Install geckodriver or set GECKODRIVER to its executable path.')
results = ROOT / 'test-results'
results.mkdir(exist_ok=True)
with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]
log = (results / 'firefox-native-driver.log').open('w')
process = subprocess.Popen([DRIVER, '--allow-system-access', '--host', '127.0.0.1', '--port', str(port)], stdout=log, stderr=log, env={**os.environ, 'MOZ_DISABLE_CONTENT_SANDBOX': '1'})
base = f'http://127.0.0.1:{port}'
session_id = None


def call(method, route, data=None):
    request = urllib.request.Request(base + route, data=None if data is None else json.dumps(data).encode(), method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)['value']
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


def command(method, route, data=None):
    return call(method, f'/session/{session_id}' + route, data)


def js(script, *args):
    return command('POST', '/execute/sync', {'script': script, 'args': list(args)})


def async_js(script, *args):
    wrapper = 'const done=arguments[arguments.length-1]; (async()=>{' + script + '})().then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));'
    result = command('POST', '/execute/async', {'script': wrapper, 'args': list(args)})
    assert result['ok'], result
    return result.get('value')


def wait(script, timeout=16):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if js('return ' + script):
            return
        time.sleep(.05)
    raise AssertionError('Timed out: ' + script)


def click(selector):
    element = command('POST', '/element', {'using': 'css selector', 'value': selector})
    element_id = element['element-6066-11e4-a52e-4f735466cecf']
    command('POST', '/element/' + element_id + '/click', {})


try:
    for attempt in range(100):
        try:
            call('GET', '/status')
            break
        except (OSError, RuntimeError):
            time.sleep(.05)
    options = {'args': ['-headless'], 'prefs': {'extensions.webextensions.uuids': json.dumps({ADDON_ID: UUID})}}
    if os.environ.get('GET_JOKE_FIREFOX'):
        options['binary'] = os.environ['GET_JOKE_FIREFOX']
    session = call('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'firefox', 'moz:firefoxOptions': options}}})
    session_id = session['sessionId']
    installed = command('POST', '/moz/addon/install', {'path': str(ROOT / f'dist/Get-Joke-firefox-{VERSION}-amo.zip'), 'temporary': True})
    assert installed == ADDON_ID
    command('POST', '/url', {'url': f'moz-extension://{UUID}/index.html'})
    wait("document.querySelector('#joke-card')?.getAttribute('aria-busy')==='false'")
    live_api = js("return Boolean(document.querySelector('#joke-text').textContent)")
    live_notice = js("return document.querySelector('#notice').textContent")
    print('Live JokeAPI:', live_api, live_notice, flush=True)
    assert live_api or live_notice, 'Neither a joke nor a recoverable network error was shown'
    fixture = json.loads((ROOT / 'tests/fixtures/twopart.json').read_text())
    async_js("const fixture=arguments[0]; window.fetch=async(url)=>{window.__lastJokeUrl=url;return new window.Response(JSON.stringify(fixture),{status:200,headers:{'Content-Type':'application/json'}})}; await browser.storage.sync.set({lang:'en',joketypes:'safe',categories:['Programming'],theme:'light'}); return true;", fixture)
    wait("document.querySelector('#joke-text').textContent===" + json.dumps(fixture['setup']))
    wait("document.querySelector('#joke-card').getAttribute('aria-busy')==='false'")
    assert js('return window.__lastJokeUrl').endswith('&safe-mode')
    if js("return !document.querySelector('#reveal').hidden"):
        assert js("return document.querySelector('#punchline').hidden")
        click('#reveal')
        assert js("return !document.querySelector('#punchline').hidden && Boolean(document.querySelector('#punchline').textContent)")
    click('#copy-joke')
    wait("document.querySelector('#copy-status').textContent==='Copied!'")
    async_js("await browser.storage.sync.set({lang:'en',joketypes:'safe',categories:['Programming'],theme:'dark'}); return true;")
    wait("document.documentElement.dataset.theme==='dark'")
    permissions = async_js('return await browser.permissions.getAll();')
    assert permissions['permissions'] == ['storage'], permissions
    assert not permissions['origins'], permissions
    assert js('return browser.runtime.id') == ADDON_ID
    screenshot = command('GET', '/screenshot')
    (results / 'firefox-native-popup.png').write_bytes(base64.b64decode(screenshot))
    command('POST', '/url', {'url': f'moz-extension://{UUID}/options/options.html'})
    wait("!document.querySelector('#settings-fields').disabled")
    assert js("return document.querySelector('#theme').value") == 'dark'
    assert js("return document.querySelectorAll('input[name=category]:checked').length") == 1
    assert js("return document.querySelector('input[value=Dark]').disabled && !document.querySelector('input[value=Dark]').checked")
    click('#safe-mode')
    assert not js("return document.querySelector('input[value=Dark]').disabled")
    click('#safe-mode')
    assert js("return document.querySelector('input[value=Dark]').disabled")
    js("const el=document.querySelector('#theme');el.value='light';el.dispatchEvent(new Event('change',{bubbles:true}));")
    click('#save-settings')
    wait("document.querySelector('#save-status').textContent==='Settings saved'")
    assert async_js("return (await browser.storage.sync.get('theme')).theme;") == 'light'
    command('POST', '/refresh', {})
    wait("!document.querySelector('#settings-fields').disabled")
    assert js("return document.querySelector('#theme').value") == 'light'
    report = {
        'browser': 'Firefox', 'version': session['capabilities']['browserVersion'], 'pass': True,
        'scope': 'Actual packaged extension temporarily installed with WebDriver; real storage, manifest/CSP page loading, user-activated clipboard write and preferences. A controlled fetch response is installed in the extension window for repeatable reveal/copy assertions. Live API outcome is reported separately.',
        'liveJokeApiRequest': {'success': live_api, 'notice': live_notice},
        'checks': ['install', 'extension page load', 'localized native messages', 'bare safe-mode request flag', 'reveal', 'native clipboard write without additional permission', 'native storage.onChanged', 'settings save and reload', 'Safe mode checkbox dependency', 'storage-only permissions', 'preserved extension ID'],
        'permissions': permissions,
    }
    (results / 'firefox-native.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
finally:
    if session_id:
        try:
            command('DELETE', '')
        except (OSError, RuntimeError):
            pass
    process.terminate()
    process.wait(timeout=10)
    log.close()
