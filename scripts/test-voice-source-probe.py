import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name('voice-source-probe.py')
spec = importlib.util.spec_from_file_location('voice_source_probe', path)
probe = importlib.util.module_from_spec(spec)
if path.exists():
    spec.loader.exec_module(probe)


class SourceProbeTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(getattr(probe, 'select_audio', None)), 'Source selection is not implemented')

    def test_audio_selection_does_not_choose_video_or_manifest(self):
        formats = [
            {'url': 'https://a.googlevideo.com/a', 'vcodec': 'h264', 'acodec': 'aac', 'protocol': 'https'},
            {'url': 'https://a.googlevideo.com/b', 'vcodec': 'none', 'acodec': 'opus', 'protocol': 'm3u8_native'},
            {'url': 'https://a.googlevideo.com/c', 'vcodec': 'none', 'acodec': 'opus', 'protocol': 'https', 'format_id': '250'},
        ]
        self.assertEqual(probe.select_audio(formats)['format_id'], '250')

    def test_signed_urls_cannot_target_local_network_or_wrong_domain(self):
        for url in ['http://a.googlevideo.com/a', 'https://127.0.0.1/a',
                    'https://googlevideo.com.evil.test/a', 'https://evil.test/a',
                    'https://user:password@a.googlevideo.com/a', 'https://a.googlevideo.com:8443/a']:
            self.assertFalse(probe.allowed_media_url(url), url)
        self.assertTrue(probe.allowed_media_url('https://r1---sn.test.googlevideo.com/audio?sig=secret'))

    def test_ended_source_cannot_be_reported_live_ready(self):
        self.assertEqual(probe.source_mode({'live_status': 'was_live'}), 'replay_only')
        self.assertEqual(probe.source_mode({'live_status': 'is_live'}), 'live')
        self.assertEqual(probe.source_mode({'live_status': 'is_upcoming'}), 'not_playable')

    def test_error_report_never_includes_signed_urls_or_credentials(self):
        result = probe.safe_failure(RuntimeError('https://x?sig=secret sk-testcredential'))
        self.assertEqual(result, {'status': 'failed', 'error_type': 'RuntimeError'})

    def test_known_failure_categories_do_not_expose_error_text(self):
        for message, reason in [
            ("Sign in to confirm you’re not a bot https://x?sig=secret", 'youtube_bot_check'),
            ('HTTP Error 403: Forbidden https://x?token=secret', 'http_forbidden'),
            ('HTTP Error 429: Too Many Requests', 'http_rate_limited'),
            ('This video is private', 'video_private'),
            ('Requested format is not available', 'format_unavailable'),
            ('The read operation timed out', 'network_timeout'),
        ]:
            result = probe.safe_failure(RuntimeError(message))
            self.assertEqual(result.get('reason'), reason)
            self.assertNotIn('secret', str(result))


if __name__ == '__main__':
    unittest.main()
