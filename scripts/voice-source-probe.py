"""Bounded read-only probe. No AI, browser cookies, DB writes or live activation.

The Vercel BUILD network is checked, not the production function/daemon network.
Run manually or through the preview-only build wrapper. Do not use as a worker.
"""
import hashlib
import json
import os
import signal
import sys
import tempfile
import time
import urllib.parse
import urllib.request

VIDEO_ID = 'tBZ_wBUQtRI'
VERSION = '2026.10.26'


def allowed_media_url(url):
    try:
        parsed = urllib.parse.urlsplit(url)
        return (parsed.scheme == 'https' and bool(parsed.hostname)
                and parsed.hostname.endswith('.googlevideo.com')
                and not parsed.username and not parsed.password
                and parsed.port in (None, 443))
    except ValueError:
        return False


def select_audio(formats):
    return next((f for f in formats
                 if f.get('vcodec') == 'none' and f.get('acodec') not in ('none', None)
                 and f.get('protocol') == 'https' and allowed_media_url(f.get('url', ''))), None)


def source_mode(info):
    return {'is_live': 'live', 'was_live': 'replay_only',
            'not_live': 'replay_only', 'post_live': 'replay_only'}.get(info.get('live_status'), 'not_playable')


def safe_failure(error):
    # yt-dlp exceptions can contain signed source URLs. Never log exception text.
    result = {'status': 'failed', 'error_type': type(error).__name__}
    message = str(error).lower()
    categories = [
        ('not a bot', 'youtube_bot_check'),
        ('http error 403', 'http_forbidden'),
        ('http error 429', 'http_rate_limited'),
        ('video is private', 'video_private'),
        ('requested format is not available', 'format_unavailable'),
        ('timed out', 'network_timeout'),
    ]
    for fragment, reason in categories:
        if fragment in message:
            result['reason'] = reason
            break
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class QuietLogger:
    def debug(self, *args): pass
    def warning(self, *args): pass
    def error(self, *args): pass


def run_probe(directory):
    # Bootstrap the exact upstream release from PyPI in a temporary directory.
    # No project dependencies or production environment variables are changed.
    with urllib.request.urlopen(f'https://pypi.org/pypi/yt-dlp/{VERSION}/json', timeout=10) as response:
        meta = json.load(response)
    wheel = next(x for x in meta['urls'] if x['filename'].endswith('py3-none-any.whl'))
    if urllib.parse.urlsplit(wheel['url']).hostname != 'files.pythonhosted.org':
        raise ValueError('Unexpected package host')
    with urllib.request.urlopen(wheel['url'], timeout=15) as response:
        body = response.read(10 * 1024 * 1024 + 1)
    if len(body) > 10 * 1024 * 1024 or hashlib.sha256(body).hexdigest() != wheel['digests']['sha256']:
        raise ValueError('Package checksum mismatch')
    wheel_path = os.path.join(directory, 'yt_dlp.whl')
    with open(wheel_path, 'wb') as output:
        output.write(body)
    sys.path.insert(0, wheel_path)
    import yt_dlp
    with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'logger': QuietLogger(),
                          'noplaylist': True, 'socket_timeout': 12, 'retries': 0,
                          'extractor_retries': 0, 'cachedir': False,
                          'js_runtimes': {'node': {}}, 'remote_components': []}) as ydl:
        info = ydl.extract_info(f'https://www.youtube.com/watch?v={VIDEO_ID}', download=False)
    if info.get('id') != VIDEO_ID:
        raise ValueError('Unexpected video')
    audio = select_audio(info.get('formats', []))
    result = {'status': 'metadata_only', 'video_id': VIDEO_ID,
              'mode': source_mode(info), 'live_status': info.get('live_status'),
              'runtime_verified': False, 'live_activation': False,
              'ai_calls': 0, 'media_bytes': 0}
    if not audio:
        result['reason'] = 'no_direct_audio_format'
        return result
    headers = {'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-32767'}
    # Forbid redirects, arbitrary hosts and credential forwarding. Read <=32 KiB.
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(urllib.request.Request(audio['url'], headers=headers), timeout=15) as response:
        content_type = response.headers.get('Content-Type', '').lower()
        body = response.read(32768)
    if not body or not (content_type.startswith('audio/') or content_type.startswith('video/')):
        raise ValueError('No audio bytes')
    result.update(status='audio_bytes_read', format_id=audio.get('format_id'),
                  media_bytes=len(body), content_type=content_type)
    return result


def timeout(*args):
    raise TimeoutError('Source probe deadline')


if __name__ == '__main__':
    start = time.monotonic()
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(75)
    try:
        with tempfile.TemporaryDirectory(prefix='ruru-source-probe-') as directory:
            report = run_probe(directory)
    except Exception as error:
        report = safe_failure(error)
    finally:
        signal.alarm(0)
    report['elapsed_seconds'] = round(time.monotonic() - start, 2)
    report['location'] = 'vercel_build' if os.getenv('VERCEL') == '1' else 'local'
    print('VOICE_SOURCE_PROBE ' + json.dumps(report, ensure_ascii=False), flush=True)
