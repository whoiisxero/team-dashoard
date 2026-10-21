"""Use the local Chromium by default or a Playwright browser supplied by CI."""
import os
CHROMIUM=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium')
