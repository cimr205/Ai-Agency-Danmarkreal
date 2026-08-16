"""
Django application configuration for the PMS (Performance Management System) app.
"""

import sys

from django.apps import AppConfig
from django.conf import settings


class PmsConfig(AppConfig):
    """
    This class provides configuration settings for the PMS app, such as the default
    database field type and the app's name.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "pms"

    def ready(self):
        from django.urls import include, path

        from horilla.urls import urlpatterns

        settings.APPS.append("pms")
        urlpatterns.append(
            path("pms/", include("pms.urls")),
        )
        super().ready()

        # Avoid DB work during app initialization for management commands.
        if len(sys.argv) > 1 and sys.argv[1] in {
            "check",
            "migrate",
            "makemigrations",
            "collectstatic",
            "test",
            "shell",
        }:
            return

        try:
            from pms.signals import start_automation

            start_automation()
        except Exception:
            # Keep startup resilient if PMS automation can't initialize.
            pass
