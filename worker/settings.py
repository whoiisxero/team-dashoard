from __future__ import annotations
import os
import logging
import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path


def bounded(name, default, maximum):
    try: return max(1, min(maximum, int(os.getenv(name, str(default)))))
    except ValueError: return default


@dataclass(frozen=True)
class Settings:
    data: Path
    secret: str
    api_key: str
    model: str = 'gpt-4.1-mini'
    member_daily: int = 3
    global_daily: int = 12
    queue_limit: int = 4
    retention_days: int = 14
    max_calls: int = 6
    max_output: int = 1500
    max_seconds: int = 180
    max_steps: int = 8

    @classmethod
    def from_env(cls):
        return cls(Path(os.getenv('Q_RESEARCH_DATA', '/data')), os.getenv('Q_RESEARCH_WORKER_SECRET', '').strip(),
                   os.getenv('OPENAI_API_KEY', '').strip(), os.getenv('Q_RESEARCH_MODEL', 'gpt-4.1-mini').strip(),
                   bounded('Q_RESEARCH_MEMBER_DAILY', 3, 20), bounded('Q_RESEARCH_GLOBAL_DAILY', 12, 100),
                   bounded('Q_RESEARCH_QUEUE_LIMIT', 4, 12), bounded('Q_RESEARCH_RETENTION_DAYS', 14, 30))


def privacy_environment(data):
    # Set before importing Browser Use; never sync tasks, screenshots or results to its cloud.
    os.environ.update(ANONYMIZED_TELEMETRY='false', BROWSER_USE_CLOUD_SYNC='false',
                      BROWSER_USE_DISABLE_EXTENSIONS='1', BROWSER_USE_VERSION_CHECK='false',
                      BROWSER_USE_LOGGING_LEVEL='error', BROWSER_USE_CONFIG_DIR=str(data / 'browser-config'))


class NoSDKOutput(logging.Filter):
    def filter(self, record):return not record.name.startswith(('browser_use', 'bubus', 'cdp_use'))


def silence_sdk_output():
    # The SDK installs per-agent DEBUG loggers even with its ERROR env setting.
    # Filter their shared console handlers before Agent construction, so host logs
    # do not receive questions, reasoning, page extracts or raw provider errors.
    loggers=[logging.getLogger()]+[value for value in logging.Logger.manager.loggerDict.values() if isinstance(value,logging.Logger)]
    for logger in loggers:
        for handler in logger.handlers:
            if not any(isinstance(f,NoSDKOutput) for f in handler.filters):handler.addFilter(NoSDKOutput())


def cleanup_interrupted_files(data):
    profiles=data/'profiles'
    if profiles.is_dir():
        for profile in profiles.glob('research-*'):
            if profile.is_dir() and not profile.is_symlink():shutil.rmtree(profile)
    marker=data/'active-agent.json'
    if marker.is_file():
        try:
            path=Path(json.loads(marker.read_text())['path'])
            if path.parent.resolve()==Path(tempfile.gettempdir()).resolve() and path.name.startswith('browser_use_agent_') and not path.is_symlink():shutil.rmtree(path,ignore_errors=True)
        except (ValueError,KeyError,TypeError,OSError):pass
        marker.unlink(missing_ok=True)
